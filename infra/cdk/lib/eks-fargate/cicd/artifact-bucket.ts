import { Bucket } from 'aws-cdk-lib/aws-s3';
import { RemovalPolicy } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { ArtifactKmsKey } from './artifact-kms-key';

export class ArtifactBucket extends Construct {
    bucket: Bucket;

    constructor(scope: Construct, id: string, kmsKey: ArtifactKmsKey) {
        super(scope, id);

        this.bucket = new Bucket(this, 'Bucket', {
            removalPolicy: RemovalPolicy.DESTROY,
            autoDeleteObjects: true,
            encryptionKey: kmsKey.key,
            enforceSSL: true,
        });
    }
}
