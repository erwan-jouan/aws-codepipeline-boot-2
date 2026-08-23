import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import { Key } from 'aws-cdk-lib/aws-kms';
import { AccountPrincipal, Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { Constants } from '../../constants';

export class ArtifactKmsKey extends Construct {
    key: Key;

    constructor(scope: Construct, id: string) {
        super(scope, id);

        this.key = new Key(this, 'Key', {
            description: 'Cross-account artifact encryption key for Fargate pipeline',
            enableKeyRotation: true,
            removalPolicy: RemovalPolicy.DESTROY,
            pendingWindow: Duration.days(7),
        });

        // Allow PROD account to decrypt artifacts
        this.key.addToResourcePolicy(new PolicyStatement({
            effect: Effect.ALLOW,
            principals: [new AccountPrincipal(process.env.PROD_ACCOUNT_ID)],
            actions: ['kms:Decrypt', 'kms:DescribeKey'],
            resources: ['*'],
        }));
    }
}