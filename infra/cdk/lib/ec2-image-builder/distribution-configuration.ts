import { CfnDistributionConfiguration } from "aws-cdk-lib/aws-imagebuilder";
import { Construct } from "constructs";
import { Constants } from "../constants";
import { Ec2Architecture } from "../utils/ec2-architecture";

export interface DistributionConfigurationProps {
    architecture: Ec2Architecture;
    projectName: string;
    cicdAccountId: string;
    prodAccountId: string;
    region: string;
}

export class DistributionConfiguration extends Construct {

    arn: string;

    constructor(scope: Construct, id: string, props: DistributionConfigurationProps) {
        super(scope, id);

        const { projectName, cicdAccountId, prodAccountId, region, architecture } = props;

        const organizationalUnitArn = `arn:aws:organizations::${cicdAccountId}:ou/${Constants.ORGANIZATION_ID}/${Constants.ORGANIZATION_UNIT_ID}`;

        const lcProperty: CfnDistributionConfiguration.LaunchPermissionConfigurationProperty = {
            organizationalUnitArns: [organizationalUnitArn],
            userIds: [prodAccountId],
        };

        const amiDistributionConfigurationName = `${projectName}-${architecture.label}-${region}-{{ imagebuilder:buildDate }}`;

        const amiDistributionConfiguration: CfnDistributionConfiguration.AmiDistributionConfigurationProperty = {
            name: amiDistributionConfigurationName,
            amiTags: {
                "Name": projectName,
                "Architecture": architecture.label,
                "BaseOs": "al2023",
            },
            description: "Ami with agents and Java",
            launchPermissionConfiguration: lcProperty,
        };

        const distProps: CfnDistributionConfiguration.DistributionProperty = {
            region: region,
            amiDistributionConfiguration: amiDistributionConfiguration,
        };

        const distributionConfiguration = new CfnDistributionConfiguration(this, 'distributionConfiguration', {
            name: projectName,
            distributions: [distProps],
            tags: {
                "Name": projectName,
                "Architecture": architecture.label,
                "BaseOs": "al2023",
            },
        });
        this.arn = distributionConfiguration.attrArn;
    }
}
