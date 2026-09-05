import { AccountPrincipal, Effect, ManagedPolicy, PolicyStatement, Role } from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { Constants } from '../../constants';

export class CrossAccountDeployRole extends Construct {
    role: Role;

    constructor(scope: Construct, id: string) {
        super(scope, id);

        const policy = new ManagedPolicy(this, 'Policy', {
            statements: [
                // Allow kubectl to describe the EKS cluster (needed for aws eks update-kubeconfig)
                new PolicyStatement({
                    effect: Effect.ALLOW,
                    actions: ['eks:DescribeCluster'],
                    resources: ['*'],
                }),
            ],
        });

        // Trust the CICD account — CodeBuild assumes this role to run kubectl against EKS.
        // The role is also added to the cluster's aws-auth ConfigMap as system:masters,
        // which grants full Kubernetes RBAC access.
        this.role = new Role(this, 'Role', {
            roleName: Constants.EKS_CROSS_ACCOUNT_ROLE_NAME,
            assumedBy: new AccountPrincipal(process.env.CICD_ACCOUNT_ID),
            managedPolicies: [policy],
        });
    }
}
