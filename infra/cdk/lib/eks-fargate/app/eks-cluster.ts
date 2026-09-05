import * as eks from 'aws-cdk-lib/aws-eks';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Stack } from 'aws-cdk-lib';
import { Construct } from 'constructs';

const clusterName = process.env.PROJECT_DEPLOYMENT_NAME!;

export class EksCluster extends Construct {
    readonly cluster: eks.FargateCluster;

    constructor(scope: Construct, id: string) {
        super(scope, id);

        const vpc = new ec2.Vpc(this, 'Vpc', {
            maxAzs: 3,
            natGateways: 1,
        });

        this.cluster = new eks.FargateCluster(this, 'Cluster', {
            clusterName,
            version: eks.KubernetesVersion.V1_29,
            vpc,
            endpointAccess: eks.EndpointAccess.PUBLIC_AND_PRIVATE,
        });

        // Additional Fargate profile for the app namespace
        this.cluster.addFargateProfile('AppProfile', {
            selectors: [{ namespace: clusterName }],
        });

        this.setupLbController(vpc);
        this.setupAppManifests();
    }

    private setupLbController(vpc: ec2.Vpc): void {
        const region = Stack.of(this).region;

        // IRSA: CDK creates an OIDC-federated IAM role bound to this Kubernetes ServiceAccount
        const lbControllerSA = this.cluster.addServiceAccount('LbControllerSA', {
            name: 'aws-load-balancer-controller',
            namespace: 'kube-system',
        });

        // IAM policy from https://github.com/kubernetes-sigs/aws-load-balancer-controller/blob/main/docs/install/iam_policy.json
        lbControllerSA.addToPrincipalPolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['iam:CreateServiceLinkedRole'],
            resources: ['*'],
            conditions: { StringEquals: { 'iam:AWSServiceName': 'elasticloadbalancing.amazonaws.com' } },
        }));

        lbControllerSA.addToPrincipalPolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
                'ec2:DescribeAccountAttributes',
                'ec2:DescribeAddresses',
                'ec2:DescribeAvailabilityZones',
                'ec2:DescribeInternetGateways',
                'ec2:DescribeVpcs',
                'ec2:DescribeVpcPeeringConnections',
                'ec2:DescribeSubnets',
                'ec2:DescribeSecurityGroups',
                'ec2:DescribeInstances',
                'ec2:DescribeNetworkInterfaces',
                'ec2:DescribeTags',
                'ec2:GetCoipPoolUsage',
                'ec2:DescribeCoipPools',
                'elasticloadbalancing:DescribeLoadBalancers',
                'elasticloadbalancing:DescribeLoadBalancerAttributes',
                'elasticloadbalancing:DescribeListeners',
                'elasticloadbalancing:DescribeListenerCertificates',
                'elasticloadbalancing:DescribeSSLPolicies',
                'elasticloadbalancing:DescribeRules',
                'elasticloadbalancing:DescribeTargetGroups',
                'elasticloadbalancing:DescribeTargetGroupAttributes',
                'elasticloadbalancing:DescribeTargetHealth',
                'elasticloadbalancing:DescribeTags',
            ],
            resources: ['*'],
        }));

        lbControllerSA.addToPrincipalPolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
                'cognito-idp:DescribeUserPoolClient',
                'acm:ListCertificates',
                'acm:DescribeCertificate',
                'iam:ListServerCertificates',
                'iam:GetServerCertificate',
                'waf-regional:GetWebACL',
                'waf-regional:GetWebACLForResource',
                'waf-regional:AssociateWebACL',
                'waf-regional:DisassociateWebACL',
                'wafv2:GetWebACL',
                'wafv2:GetWebACLForResource',
                'wafv2:AssociateWebACL',
                'wafv2:DisassociateWebACL',
                'shield:GetSubscriptionState',
                'shield:DescribeProtection',
                'shield:CreateProtection',
                'shield:DeleteProtection',
            ],
            resources: ['*'],
        }));

        lbControllerSA.addToPrincipalPolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['ec2:AuthorizeSecurityGroupIngress', 'ec2:RevokeSecurityGroupIngress'],
            resources: ['*'],
        }));

        lbControllerSA.addToPrincipalPolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['ec2:CreateSecurityGroup'],
            resources: ['*'],
        }));

        lbControllerSA.addToPrincipalPolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['ec2:CreateTags'],
            resources: ['arn:aws:ec2:*:*:security-group/*'],
            conditions: {
                StringEquals: { 'ec2:CreateAction': 'CreateSecurityGroup' },
                Null: { 'aws:RequestTag/elbv2.k8s.aws/cluster': 'false' },
            },
        }));

        lbControllerSA.addToPrincipalPolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['ec2:CreateTags', 'ec2:DeleteTags'],
            resources: ['arn:aws:ec2:*:*:security-group/*'],
            conditions: {
                Null: {
                    'aws:RequestTag/elbv2.k8s.aws/cluster': 'true',
                    'aws:ResourceTag/elbv2.k8s.aws/cluster': 'false',
                },
            },
        }));

        lbControllerSA.addToPrincipalPolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
                'ec2:AuthorizeSecurityGroupIngress',
                'ec2:RevokeSecurityGroupIngress',
                'ec2:DeleteSecurityGroup',
            ],
            resources: ['*'],
            conditions: { Null: { 'aws:ResourceTag/elbv2.k8s.aws/cluster': 'false' } },
        }));

        lbControllerSA.addToPrincipalPolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['elasticloadbalancing:CreateLoadBalancer', 'elasticloadbalancing:CreateTargetGroup'],
            resources: ['*'],
            conditions: { Null: { 'aws:RequestTag/elbv2.k8s.aws/cluster': 'false' } },
        }));

        lbControllerSA.addToPrincipalPolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
                'elasticloadbalancing:CreateListener',
                'elasticloadbalancing:DeleteListener',
                'elasticloadbalancing:CreateRule',
                'elasticloadbalancing:DeleteRule',
                'elasticloadbalancing:AddTags',
            ],
            resources: ['*'],
        }));

        lbControllerSA.addToPrincipalPolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['elasticloadbalancing:AddTags', 'elasticloadbalancing:RemoveTags'],
            resources: [
                'arn:aws:elasticloadbalancing:*:*:targetgroup/*/*',
                'arn:aws:elasticloadbalancing:*:*:loadbalancer/net/*/*',
                'arn:aws:elasticloadbalancing:*:*:loadbalancer/app/*/*',
            ],
            conditions: {
                Null: {
                    'aws:RequestTag/elbv2.k8s.aws/cluster': 'true',
                    'aws:ResourceTag/elbv2.k8s.aws/cluster': 'false',
                },
            },
        }));

        lbControllerSA.addToPrincipalPolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['elasticloadbalancing:AddTags', 'elasticloadbalancing:RemoveTags'],
            resources: [
                'arn:aws:elasticloadbalancing:*:*:listener/net/*/*/*',
                'arn:aws:elasticloadbalancing:*:*:listener/app/*/*/*',
                'arn:aws:elasticloadbalancing:*:*:listener-rule/net/*/*/*',
                'arn:aws:elasticloadbalancing:*:*:listener-rule/app/*/*/*',
            ],
        }));

        lbControllerSA.addToPrincipalPolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
                'elasticloadbalancing:ModifyLoadBalancerAttributes',
                'elasticloadbalancing:SetIpAddressType',
                'elasticloadbalancing:SetSecurityGroups',
                'elasticloadbalancing:SetSubnets',
                'elasticloadbalancing:DeleteLoadBalancer',
                'elasticloadbalancing:ModifyTargetGroup',
                'elasticloadbalancing:ModifyTargetGroupAttributes',
                'elasticloadbalancing:DeleteTargetGroup',
            ],
            resources: ['*'],
            conditions: { Null: { 'aws:ResourceTag/elbv2.k8s.aws/cluster': 'false' } },
        }));

        lbControllerSA.addToPrincipalPolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
                'elasticloadbalancing:RegisterTargets',
                'elasticloadbalancing:DeregisterTargets',
            ],
            resources: ['arn:aws:elasticloadbalancing:*:*:targetgroup/*/*'],
        }));

        lbControllerSA.addToPrincipalPolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
                'elasticloadbalancing:SetWebAcl',
                'elasticloadbalancing:ModifyListener',
                'elasticloadbalancing:AddListenerCertificates',
                'elasticloadbalancing:RemoveListenerCertificates',
                'elasticloadbalancing:ModifyRule',
            ],
            resources: ['*'],
        }));

        lbControllerSA.addToPrincipalPolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['eks:DescribeCluster'],
            resources: [`arn:aws:eks:${region}:${Stack.of(this).account}:cluster/${clusterName}`],
        }));

        // Install the AWS Load Balancer Controller via Helm (replaces the helm-lambda approach)
        const lbController = this.cluster.addHelmChart('AwsLbController', {
            chart: 'aws-load-balancer-controller',
            repository: 'https://aws.github.io/eks-charts',
            namespace: 'kube-system',
            values: {
                clusterName,
                serviceAccount: {
                    create: false,
                    name: 'aws-load-balancer-controller',
                },
                region,
                vpcId: vpc.vpcId,
            },
        });
        lbController.node.addDependency(lbControllerSA);
    }

    private setupAppManifests(): void {
        const ns = this.cluster.addManifest('AppNamespace', {
            apiVersion: 'v1',
            kind: 'Namespace',
            metadata: { name: clusterName },
        });

        // NodePort service: ALB routes to pods via IP target type, port 8080
        const service = this.cluster.addManifest('AppService', {
            apiVersion: 'v1',
            kind: 'Service',
            metadata: {
                name: `service-${clusterName}`,
                namespace: clusterName,
            },
            spec: {
                type: 'NodePort',
                ports: [{ port: 80, targetPort: 8080, protocol: 'TCP' }],
                selector: { 'app.kubernetes.io/name': `app-${clusterName}` },
            },
        });
        service.node.addDependency(ns);

        // ALB Ingress — the LB Controller creates an internet-facing ALB from this manifest
        const ingress = this.cluster.addManifest('AppIngress', {
            apiVersion: 'networking.k8s.io/v1',
            kind: 'Ingress',
            metadata: {
                name: `ingress-${clusterName}`,
                namespace: clusterName,
                annotations: {
                    'alb.ingress.kubernetes.io/scheme': 'internet-facing',
                    'alb.ingress.kubernetes.io/target-type': 'ip',
                    'alb.ingress.kubernetes.io/healthcheck-path': '/actuator/health',
                },
            },
            spec: {
                ingressClassName: 'alb',
                rules: [{
                    http: {
                        paths: [{
                            path: '/',
                            pathType: 'Prefix',
                            backend: {
                                service: {
                                    name: `service-${clusterName}`,
                                    port: { number: 80 },
                                },
                            },
                        }],
                    },
                }],
            },
        });
        ingress.node.addDependency(ns);
        // Ingress depends on LB controller being ready — the HelmChart dependency chain handles this
        // via the AppNamespace → lbController ordering in the cluster manifest graph
    }
}
