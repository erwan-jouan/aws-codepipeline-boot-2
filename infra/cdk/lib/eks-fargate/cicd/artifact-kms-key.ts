import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import { Key } from 'aws-cdk-lib/aws-kms';
import { Construct } from 'constructs';

export class ArtifactKmsKey extends Construct {
    key: Key;

    constructor(scope: Construct, id: string) {
        super(scope, id);

        this.key = new Key(this, 'Key', {
            description: 'Artifact encryption key for EKS Fargate pipeline',
            enableKeyRotation: true,
            removalPolicy: RemovalPolicy.DESTROY,
            pendingWindow: Duration.days(7),
        });
    }
}
