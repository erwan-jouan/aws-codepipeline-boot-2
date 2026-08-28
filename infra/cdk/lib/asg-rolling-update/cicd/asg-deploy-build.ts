import { BuildSpec, ComputeType, LinuxBuildImage, PipelineProject } from 'aws-cdk-lib/aws-codebuild';
import { LogGroup } from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import { Constants } from '../../constants';
import { CodeBuildRole } from './code-build-role';

export interface AsgDeployBuildProps {
    codeBuildRole: CodeBuildRole;
    projectDeploymentName: string;
    region: string;
    prodAccountId: string;
    targetArchitecture: string;
}

export class AsgDeployBuild extends Construct {
    project: PipelineProject;

    constructor(scope: Construct, id: string, props: AsgDeployBuildProps) {
        super(scope, id);

        const logGroup = new LogGroup(this, 'LogGroup');
        const { projectDeploymentName, region, prodAccountId, targetArchitecture, codeBuildRole } = props;
        const crossAccountRoleArn = `arn:aws:iam::${prodAccountId}:role/${Constants.ASG_CROSS_ACCOUNT_ROLE_NAME}`;
        const amiParamName = `/custom/ami/al2023/${targetArchitecture}`;

        const buildSpec = BuildSpec.fromObject({
            version: '0.2',
            phases: {
                pre_build: {
                    commands: [
                        // Read AMI ID from CICD account SSM before assuming the cross-account role
                        `export AMI_ID=$(aws ssm get-parameter --name ${amiParamName} --region ${region} --query Parameter.Value --output text)`,
                        `echo "AMI to deploy: $AMI_ID"`,
                        // Assume cross-account role to access the workload account
                        `CREDS=$(aws sts assume-role --role-arn ${crossAccountRoleArn} --role-session-name asg-rolling-deploy)`,
                        `export AWS_ACCESS_KEY_ID=$(echo $CREDS | jq -r .Credentials.AccessKeyId)`,
                        `export AWS_SECRET_ACCESS_KEY=$(echo $CREDS | jq -r .Credentials.SecretAccessKey)`,
                        `export AWS_SESSION_TOKEN=$(echo $CREDS | jq -r .Credentials.SessionToken)`,
                    ],
                },
                build: {
                    commands: [
                        // Resolve the launch template attached to the ASG
                        `LT_ID=$(aws autoscaling describe-auto-scaling-groups --auto-scaling-group-names ${projectDeploymentName} --region ${region} --query 'AutoScalingGroups[0].LaunchTemplate.LaunchTemplateId' --output text)`,
                        // Create a new launch template version with the new AMI, inheriting all other settings
                        `NEW_LT_VERSION=$(aws ec2 create-launch-template-version --launch-template-id $LT_ID --source-version '$Latest' --launch-template-data "{\\"ImageId\\":\\"$AMI_ID\\"}" --region ${region} --query 'LaunchTemplateVersion.VersionNumber' --output text)`,
                        // Set the new version as default so the ASG picks it up without needing ec2:RunInstances
                        `aws ec2 modify-launch-template --launch-template-id $LT_ID --default-version $NEW_LT_VERSION --region ${region}`,
                        // Start the refresh without --desired-configuration to avoid the ec2:RunInstances check
                        `REFRESH_ID=$(aws autoscaling start-instance-refresh --auto-scaling-group-name ${projectDeploymentName} --region ${region} --preferences '{"MinHealthyPercentage":50,"InstanceWarmup":300}' --query InstanceRefreshId --output text)`,
                        `echo "Instance refresh started: $REFRESH_ID"`,
                        [
                            `while true; do`,
                            `  STATUS=$(aws autoscaling describe-instance-refreshes --auto-scaling-group-name ${projectDeploymentName} --region ${region} --instance-refresh-ids $REFRESH_ID --query 'InstanceRefreshes[0].Status' --output text);`,
                            `  echo "Refresh status: $STATUS";`,
                            `  if [ "$STATUS" = "Successful" ]; then echo "Instance refresh succeeded"; break; fi;`,
                            `  if [ "$STATUS" = "Failed" ] || [ "$STATUS" = "Cancelled" ]; then echo "Instance refresh $STATUS"; exit 1; fi;`,
                            `  sleep 30;`,
                            `done`,
                        ].join(' '),
                    ],
                },
            },
        });

        this.project = new PipelineProject(this, 'Project', {
            projectName: 'asg-rolling-deploy',
            role: codeBuildRole.role,
            environment: {
                computeType: ComputeType.SMALL,
                buildImage: LinuxBuildImage.STANDARD_7_0,
            },
            buildSpec,
            logging: { cloudWatch: { logGroup } },
        });
    }
}
