import * as cdk from 'aws-cdk-lib';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { Ec2InstanceProfile } from './ec2-instance-profile';
import { InfrastructureConfiguration } from './infrastructure-configuration';
import { BinariesComponent } from './binaries-component';
import { ImageRecipe } from './image-recipe';
import { ConfigComponent } from './config-component';
import { DistributionConfiguration } from './distribution-configuration';
import { ImagePipeline } from './image-pipeline';
import { Ec2Image } from './ec2-Image';
import { ParameterStoreUpdater } from './parameter-store-updater';
import { Ec2Architecture } from '../utils/ec2-architecture';

export interface CdkStackProps extends cdk.StackProps {
    projectName: string;
    cicdAccountId: string;
    prodAccountId: string;
    region: string;
}

export class CdkStack extends cdk.Stack {

    constructor(scope: Construct, id: string, props: CdkStackProps) {
        super(scope, id, props);

        const { projectName, cicdAccountId, prodAccountId, region } = props;
        const architecture = Ec2Architecture.X86_64;

        const instanceProfile = new Ec2InstanceProfile(this, 'instanceProfile');

        const infrastructureConfiguration = new InfrastructureConfiguration(this, 'infrastructureConfiguration', {
            instanceProfileName: instanceProfile.name,
            architecture,
            projectName,
        });

        infrastructureConfiguration.bucket.grantWrite(instanceProfile.role);

        const cloudwatchAgentConfig = new ssm.StringParameter(this, 'CloudWatchAgentConfig', {
            parameterName: '/custom/cloudwatch-agent/config/linux',
            description: 'CloudWatch agent configuration for EC2 instances built by Image Builder',
            stringValue: JSON.stringify({
                agent: { metrics_collection_interval: 60 },
                metrics: {
                    append_dimensions: {
                        AutoScalingGroupName: '${aws:AutoScalingGroupName}',
                        ImageId: '${aws:ImageId}',
                        InstanceId: '${aws:InstanceId}',
                        InstanceType: '${aws:InstanceType}',
                    },
                    metrics_collected: {
                        cpu: {
                            measurement: ['cpu_usage_idle', 'cpu_usage_iowait', 'cpu_usage_user', 'cpu_usage_system'],
                            metrics_collection_interval: 60,
                            totalcpu: false,
                        },
                        disk: {
                            measurement: ['used_percent', 'inodes_free'],
                            metrics_collection_interval: 60,
                            resources: ['*'],
                        },
                        mem: {
                            measurement: ['mem_used_percent'],
                            metrics_collection_interval: 60,
                        },
                    },
                },
            }),
        });
        cloudwatchAgentConfig.grantRead(instanceProfile.role);

        const binariesComponent = new BinariesComponent(this, 'binariesComponent', { projectName });
        const configComponent = new ConfigComponent(this, 'configComponent', { projectName });

        const imageRecipe = new ImageRecipe(this, 'ImageRecipe', {
            binaryComponentArn: binariesComponent.arn,
            configComponentArn: configComponent.arn,
            architecture,
            projectName,
        });

        const distributionConfiguration = new DistributionConfiguration(this, 'DistributionConfiguration', {
            architecture,
            projectName,
            cicdAccountId,
            prodAccountId,
            region,
        });

        new ImagePipeline(this, 'ImagePipeline', {
            distributionConfigurationArn: distributionConfiguration.arn,
            imageRecipeArn: imageRecipe.arn,
            infrastructureConfigurationArn: infrastructureConfiguration.arn,
            projectName,
        });

        const ec2Image = new Ec2Image(this, 'ec2Image', imageRecipe.arn, distributionConfiguration.arn, infrastructureConfiguration.arn);
        ec2Image.node.addDependency(cloudwatchAgentConfig);

        const resource = new ParameterStoreUpdater(this, 'ParameterStoreUpdater', ec2Image.amiId, architecture);

        new cdk.CfnOutput(this, 'ResponseMessage', {
            description: 'The message that came back from the Custom Resource',
            value: resource.response,
        });
    }
}
