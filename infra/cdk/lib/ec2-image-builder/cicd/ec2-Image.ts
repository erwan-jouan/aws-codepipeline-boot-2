import { CfnImage } from "aws-cdk-lib/aws-imagebuilder";
import { Construct } from "constructs";

export interface HasAmiId {
    amiId: string
}

export class Ec2Image extends Construct implements HasAmiId {
    constructor(scope: Construct, id:string, imageRecipeArn:string, distributionConfigurationArn:string,
        infrastructureConfigurationArn: string){
        super(scope, id)
        const image = new CfnImage(this, 'image', {
            imageRecipeArn: imageRecipeArn,
            distributionConfigurationArn: distributionConfigurationArn,
            infrastructureConfigurationArn: infrastructureConfigurationArn,
            enhancedImageMetadataEnabled: false
        })
        this.amiId = image.attrImageId
    }
    amiId: string;
}