import { Stack } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { EksCluster } from './eks-cluster';
import { CrossAccountDeployRole } from './cross-account-deploy-role';
import { StressParameter } from './stress-parameter';

export class EksFargateAppStack extends Stack {
    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        const eksCluster = new EksCluster(this, 'eksCluster');
        const crossAccountDeployRole = new CrossAccountDeployRole(this, 'crossAccountDeployRole');

        // Grant CICD cross-account role kubectl admin access via aws-auth ConfigMap
        eksCluster.cluster.awsAuth.addRoleMapping(crossAccountDeployRole.role, {
            groups: ['system:masters'],
        });

        // Grant SSO console role membership in eks-console-viewers Kubernetes group,
        // which is bound to the built-in view ClusterRole by the ConsoleViewerBinding manifest.
        const consoleRoleArn = process.env.AWS_EKS_CONSOLE_ROLE_ARN;
        if (consoleRoleArn) {
            eksCluster.cluster.awsAuth.addRoleMapping(
                iam.Role.fromRoleArn(this, 'SsoConsoleRole', consoleRoleArn, { mutable: false }),
                { groups: ['eks-console-viewers'], username: 'erwan.jouan@theatomicity.com' },
            );
        }

        new StressParameter(this, 'stressParameter');
    }
}