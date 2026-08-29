import { Construct } from "constructs";
import path = require("path");
import fs = require('fs');
import { CfnComponent } from "aws-cdk-lib/aws-imagebuilder";

export interface ConfigComponentProps {
    projectName: string;
}

export class ConfigComponent extends Construct {

    arn: string;

    constructor(scope: Construct, id: string, props: ConfigComponentProps) {
        super(scope, id);
        const data = fs.readFileSync(path.join('lib', 'ec2-image-builder', 'cicd', 'template', 'config-component.yml'), { encoding: 'utf-8' });
        const cfnComponent = new CfnComponent(this, 'configComponent', {
            name: `${props.projectName}-config`,
            changeDescription: "Installs base agents configuration",
            platform: "Linux",
            description: "Installs base agents configuration",
            data: data,
            version: "1.0.0",
            supportedOsVersions: ["Amazon Linux 2023"],
            tags: {
                'Name': props.projectName,
            },
        });
        this.arn = cfnComponent.attrArn;
    }
}
