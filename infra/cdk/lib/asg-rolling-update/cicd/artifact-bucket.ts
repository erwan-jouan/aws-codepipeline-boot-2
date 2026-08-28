import { RemovalPolicy } from 'aws-cdk-lib';
import { AccountPrincipal, Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { ArtifactKmsKey } from './artifact-kms-key';

export interface ArtifactBucketProps {
    kmsKey: ArtifactKmsKey;
    prodAccountId: string;
}

export class ArtifactBucket extends Construct {
    bucket: Bucket;

    constructor(scope: Construct, id: string, props: ArtifactBucketProps) {
        super(scope, id);

        this.bucket = new Bucket(this, 'Bucket', {
            removalPolicy: RemovalPolicy.DESTROY,
            autoDeleteObjects: true,
            encryptionKey: props.kmsKey.key,
            enforceSSL: true,
        });

        this.bucket.addToResourcePolicy(new PolicyStatement({
            effect: Effect.ALLOW,
            principals: [new AccountPrincipal(props.prodAccountId)],
            actions: ['s3:Get*', 's3:List*'],
            resources: [this.bucket.bucketArn, `${this.bucket.bucketArn}/*`],
        }));
    }
}
