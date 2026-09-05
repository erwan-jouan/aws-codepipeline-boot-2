import { Repository } from 'aws-cdk-lib/aws-ecr';
import { AccountPrincipal, Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { RemovalPolicy } from 'aws-cdk-lib';
import { Construct } from 'constructs';

export class ImageRegistry extends Construct {
    repositoryUri: string;

    constructor(scope: Construct, id: string) {
        super(scope, id);

        const repo = new Repository(this, 'Repo', {
            repositoryName: process.env.PROJECT_DEPLOYMENT_NAME,
            removalPolicy: RemovalPolicy.DESTROY,
            emptyOnDelete: true,
        });

        // Allow PROD account Fargate pod execution role to pull images cross-account.
        // AmazonEKSFargatePodExecutionRolePolicy grants the pull actions; this resource
        // policy allows the PROD account principal to use them on this repository.
        repo.addToResourcePolicy(new PolicyStatement({
            effect: Effect.ALLOW,
            principals: [new AccountPrincipal(process.env.PROD_ACCOUNT_ID)],
            actions: [
                'ecr:GetDownloadUrlForLayer',
                'ecr:BatchGetImage',
                'ecr:BatchCheckLayerAvailability',
            ],
        }));

        this.repositoryUri = repo.repositoryUri;
    }
}
