import { CfnComponent } from "aws-cdk-lib/aws-imagebuilder";
import { Construct } from "constructs";
import path = require("path");
import fs = require('fs');

export interface BinariesComponentProps {
    projectName: string;
}

export class BinariesComponent extends Construct {

    arn: string;

    constructor(scope: Construct, id: string, props: BinariesComponentProps) {
        super(scope, id);
        const data = fs.readFileSync(path.join('lib', 'ec2-image-builder', 'template', 'binaries-component.yml'), { encoding: 'utf-8' });
        const cfnComponent = new CfnComponent(this, 'binariesComponent', {
            name: `${props.projectName}-binaries`,
            changeDescription: "Installs base agents",
            platform: "Linux",
            description: "Installs base agents",
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
