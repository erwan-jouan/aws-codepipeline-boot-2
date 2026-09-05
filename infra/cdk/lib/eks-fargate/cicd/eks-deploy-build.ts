import { BuildSpec, ComputeType, LinuxBuildImage, PipelineProject } from 'aws-cdk-lib/aws-codebuild';
import { LogGroup } from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import { Constants } from '../../constants';
import { CodeBuildRole } from './code-build-role';

export class EksDeployBuild extends Construct {
    project: PipelineProject;

    constructor(scope: Construct, id: string, codeBuildRole: CodeBuildRole) {
        super(scope, id);

        const logGroup = new LogGroup(this, 'LogGroup');
        const clusterName = process.env.PROJECT_DEPLOYMENT_NAME!;
        const deploymentName = process.env.DEPLOYMENT_NAME!;
        const region = process.env.CDK_DEFAULT_REGION!;
        const crossAccountRoleArn = `arn:aws:iam::${process.env.PROD_ACCOUNT_ID}:role/${Constants.EKS_CROSS_ACCOUNT_ROLE_NAME}`;

        // Deployment manifest template — IMAGE_PLACEHOLDER is substituted at runtime via sed
        const deploymentYaml = [
            'apiVersion: apps/v1',
            'kind: Deployment',
            'metadata:',
            `  name: deployment-${clusterName}`,
            `  namespace: ${clusterName}`,
            'spec:',
            '  replicas: 3',
            '  selector:',
            '    matchLabels:',
            `      app.kubernetes.io/name: app-${clusterName}`,
            '  template:',
            '    metadata:',
            '      labels:',
            `        app.kubernetes.io/name: app-${clusterName}`,
            '    spec:',
            '      containers:',
            `        - name: app-${clusterName}`,
            '          image: IMAGE_PLACEHOLDER',
            '          ports:',
            '            - containerPort: 8080',
            '          env:',
            '            - name: SPRING_PROFILES_ACTIVE',
            `              value: "${deploymentName}"`,
            '            - name: PROJECT_DEPLOYMENT_NAME',
            `              value: "${clusterName}"`,
            '          resources:',
            '            limits:',
            '              cpu: 500m',
            '              memory: 2Gi',
            '          livenessProbe:',
            '            httpGet:',
            '              path: /actuator/health',
            '              port: 8080',
            '            initialDelaySeconds: 60',
            '            timeoutSeconds: 5',
            '            periodSeconds: 10',
            '            failureThreshold: 3',
            '          readinessProbe:',
            '            httpGet:',
            `              path: /${deploymentName}`,
            '              port: 8080',
            '            initialDelaySeconds: 60',
            '            timeoutSeconds: 5',
            '            periodSeconds: 10',
            '            failureThreshold: 3',
            '          imagePullPolicy: Always',
        ].join('\n');

        const buildSpec = BuildSpec.fromObject({
            version: '0.2',
            phases: {
                install: {
                    commands: [
                        // Install kubectl matching the cluster version
                        'curl -LO https://dl.k8s.io/release/v1.29.0/bin/linux/amd64/kubectl',
                        'chmod +x kubectl && mv kubectl /usr/local/bin/',
                        'kubectl version --client',
                    ],
                },
                pre_build: {
                    commands: [
                        'export IMAGE_URI=$(jq -r ".[0].imageUri" imagedefinitions.json)',
                        // Assume cross-account role in PROD to access EKS cluster
                        `export CREDS=$(aws sts assume-role --role-arn ${crossAccountRoleArn} --role-session-name eks-deploy)`,
                        'export AWS_ACCESS_KEY_ID=$(echo $CREDS | jq -r .Credentials.AccessKeyId)',
                        'export AWS_SECRET_ACCESS_KEY=$(echo $CREDS | jq -r .Credentials.SecretAccessKey)',
                        'export AWS_SESSION_TOKEN=$(echo $CREDS | jq -r .Credentials.SessionToken)',
                        `aws eks update-kubeconfig --name ${clusterName} --region ${region}`,
                    ],
                },
                build: {
                    commands: [
                        // Write manifest with placeholder, substitute real image URI, then apply
                        `cat > /tmp/deployment.yaml << 'MANIFEST'\n${deploymentYaml}\nMANIFEST`,
                        'sed -i "s|IMAGE_PLACEHOLDER|${IMAGE_URI}|" /tmp/deployment.yaml',
                        'kubectl apply -f /tmp/deployment.yaml',
                        `kubectl rollout status deployment/deployment-${clusterName} -n ${clusterName} --timeout=300s`,
                    ],
                },
            },
        });

        this.project = new PipelineProject(this, 'Project', {
            projectName: 'eks-fargate-deploy',
            role: codeBuildRole.role,
            environment: {
                computeType: ComputeType.SMALL,
                buildImage: LinuxBuildImage.STANDARD_7_0,
            },
            buildSpec,
            logging: { cloudWatch: { logGroup } },
        });
    }
}
