import * as cdk from 'aws-cdk-lib';
import { Stack } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { GithubSource } from '../../alb-ecs-fargate/cicd/github-source';
import { ArtifactBucket } from './artifact-bucket';
import { ArtifactKmsKey } from './artifact-kms-key';
import { AsgDeployBuild } from './asg-deploy-build';
import { CodeArtifactRepo } from './code-artifact-repo';
import { CodeBuildApp } from './code-build-app';
import { CodeBuildRole } from './code-build-role';
import { CodePipeline } from './code-pipeline';
import { CodePipelineRole } from './code-pipeline-role';

export interface AsgRollingCicdProps extends cdk.StackProps {
    projectName: string;
    deploymentName: string;
    projectDeploymentName: string;
    prodAccountId: string;
    cicdAccountId: string;
    region: string;
    targetArchitecture: string;
}

export class AsgRollingCicdStack extends Stack {
    constructor(scope: Construct, id: string, props: AsgRollingCicdProps) {
        super(scope, id, props);

        const kmsKey = new ArtifactKmsKey(this, 'kmsKey', { prodAccountId: props.prodAccountId });
        const artifactBucket = new ArtifactBucket(this, 'artifactBucket', { kmsKey, prodAccountId: props.prodAccountId });
        const codeArtifactRepo = new CodeArtifactRepo(this, 'codeArtifactRepo', {
            projectName: props.projectName,
            deploymentName: props.deploymentName,
            prodAccountId: props.prodAccountId,
        });
        const githubSource = new GithubSource(this, 'githubSource');
        const codeBuildRole = new CodeBuildRole(this, 'codeBuildRole', {
            kmsKey,
            cicdAccountId: props.cicdAccountId,
            prodAccountId: props.prodAccountId,
        });
        const codeBuildApp = new CodeBuildApp(this, 'codeBuildApp', artifactBucket, codeArtifactRepo, codeBuildRole);
        const asgDeployBuild = new AsgDeployBuild(this, 'asgDeployBuild', {
            codeBuildRole,
            projectDeploymentName: props.projectDeploymentName,
            region: props.region,
            prodAccountId: props.prodAccountId,
            targetArchitecture: props.targetArchitecture,
        });
        const pipelineRole = new CodePipelineRole(this, 'codePipelineRole');

        new CodePipeline(this, 'pipeline', artifactBucket, githubSource, codeBuildApp, asgDeployBuild, pipelineRole);
    }
}
