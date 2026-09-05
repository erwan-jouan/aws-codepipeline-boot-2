import { Stack } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as cdk from 'aws-cdk-lib';
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

        new StressParameter(this, 'stressParameter');
    }
}