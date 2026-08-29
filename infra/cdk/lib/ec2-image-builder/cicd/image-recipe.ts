import * as cdk from "aws-cdk-lib";
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { CfnImageRecipe } from "aws-cdk-lib/aws-imagebuilder";
import { Construct } from "constructs";
import { Ec2Architecture } from "../../utils/ec2-architecture";

export interface ImageRecipeProps {
    binaryComponentArn: string;
    configComponentArn: string;
    architecture: Ec2Architecture;
    projectName: string;
}

export class ImageRecipe extends Construct {

    arn: string;

    constructor(scope: Construct, id: string, props: ImageRecipeProps) {
        super(scope, id);

        const region = cdk.Stack.of(this).region;
        const parentImage = ssm.StringParameter.valueForStringParameter(this, props.architecture.getBaseAmiParameterStore());

        const cfnImageRecipe = new CfnImageRecipe(this, 'imageRecipe', {
            name: props.projectName,
            parentImage: parentImage,
            version: "1.0.0",
            components: [
                { componentArn: props.binaryComponentArn },
                { componentArn: `arn:aws:imagebuilder:${region}:aws:component/aws-codedeploy-agent-linux/1.x.x` },
                { componentArn: `arn:aws:imagebuilder:${region}:aws:component/amazon-cloudwatch-agent-linux/1.x.x` },
                { componentArn: props.configComponentArn },
            ],
        });
        this.arn = cfnImageRecipe.attrArn;
    }
}
