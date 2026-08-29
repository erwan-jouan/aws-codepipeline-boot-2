import { Duration } from "aws-cdk-lib";
import { CfnInfrastructureConfiguration } from "aws-cdk-lib/aws-imagebuilder";
import { Bucket } from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";
import { Ec2Architecture } from "../../utils/ec2-architecture";

export interface InfrastructureConfigurationProps {
    instanceProfileName: string;
    architecture: Ec2Architecture;
    projectName: string;
}

export class InfrastructureConfiguration extends Construct {

    bucket: Bucket;
    arn: string;

    constructor(scope: Construct, id: string, props: InfrastructureConfigurationProps) {
        super(scope, id);

        this.bucket = new Bucket(this, 'logBucket', {
            lifecycleRules: [{ expiration: Duration.days(90) }],
        });

        const cfnInfrastructureConfiguration = new CfnInfrastructureConfiguration(this, 'cfnInfrastructureConfiguration', {
            name: props.projectName,
            instanceProfileName: props.instanceProfileName,
            instanceTypes: [props.architecture.instanceType],
            logging: {
                s3Logs: {
                    s3BucketName: this.bucket.bucketName,
                    s3KeyPrefix: 'ec2-image-builder/',
                },
            },
        });
        this.arn = cfnInfrastructureConfiguration.attrArn;
    }
}
