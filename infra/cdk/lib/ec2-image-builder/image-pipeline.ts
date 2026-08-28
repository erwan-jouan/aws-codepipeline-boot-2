import { CfnImagePipeline } from "aws-cdk-lib/aws-imagebuilder";
import { Construct } from "constructs";

export interface ImagePipelineProps {
    distributionConfigurationArn: string;
    imageRecipeArn: string;
    infrastructureConfigurationArn: string;
    projectName: string;
}

export class ImagePipeline extends Construct {
    constructor(scope: Construct, id: string, props: ImagePipelineProps) {
        super(scope, id);

        new CfnImagePipeline(this, 'imagePipeline', {
            name: `${props.projectName}-pipeline`,
            description: "Pipeline for EC2 Image Builder",
            distributionConfigurationArn: props.distributionConfigurationArn,
            imageRecipeArn: props.imageRecipeArn,
            infrastructureConfigurationArn: props.infrastructureConfigurationArn,
            status: "ENABLED",
            schedule: {
                scheduleExpression: 'cron(0 0 ? * SUN *)',
                pipelineExecutionStartCondition: 'EXPRESSION_MATCH_ONLY',
            },
            tags: {
                'Name': props.projectName,
            },
        });
    }
}
