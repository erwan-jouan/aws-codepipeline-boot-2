import { Stack } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as cdk from 'aws-cdk-lib';
import { ArtifactKmsKey } from './artifact-kms-key';
import { ArtifactBucket } from './artifact-bucket';
import { ImageRegistry } from './image-registry';
import { GithubSource } from './github-source';
import { CodeBuildRole } from './code-build-role';
import { CodeBuildApp } from './code-build-app';
import { EksDeployBuild } from './eks-deploy-build';
import { CodePipelineRole } from './code-pipeline-role';
import { CodePipeline } from './code-pipeline';

export class EksFargateCicdStack extends Stack {
    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        const kmsKey = new ArtifactKmsKey(this, 'kmsKey');
        const artifactBucket = new ArtifactBucket(this, 'artifactBucket', kmsKey);
        const imageRegistry = new ImageRegistry(this, 'imageRegistry');
        const githubSource = new GithubSource(this, 'githubSource');
        const codeBuildRole = new CodeBuildRole(this, 'codeBuildRole', kmsKey);
        const codeBuildApp = new CodeBuildApp(this, 'codeBuildApp', artifactBucket, imageRegistry, codeBuildRole);
        const eksDeployBuild = new EksDeployBuild(this, 'eksDeployBuild', codeBuildRole);
        const pipelineRole = new CodePipelineRole(this, 'codePipelineRole');

        new CodePipeline(this, 'pipeline', artifactBucket, githubSource, codeBuildApp, eksDeployBuild, pipelineRole);
    }
}
