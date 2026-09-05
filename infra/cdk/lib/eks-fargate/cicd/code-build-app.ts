import { BuildSpec, Cache, ComputeType, LinuxBuildImage, PipelineProject } from 'aws-cdk-lib/aws-codebuild';
import { LogGroup } from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import { ArtifactBucket } from './artifact-bucket';
import { CodeBuildRole } from './code-build-role';
import { ImageRegistry } from './image-registry';

export class CodeBuildApp extends Construct {
    project: PipelineProject;

    constructor(scope: Construct, id: string, artifactBucket: ArtifactBucket, imageRegistry: ImageRegistry, codeBuildRole: CodeBuildRole) {
        super(scope, id);

        const logGroup = new LogGroup(this, 'LogGroup');

        const buildSpec = BuildSpec.fromObject({
            version: '0.2',
            phases: {
                pre_build: {
                    commands: [
                        'aws --version && docker --version',
                        `aws ecr get-login-password --region ${process.env.CDK_DEFAULT_REGION} | docker login --username AWS --password-stdin ${process.env.CDK_DEFAULT_ACCOUNT}.dkr.ecr.${process.env.CDK_DEFAULT_REGION}.amazonaws.com`,
                    ],
                },
                build: {
                    commands: [
                        'cd app/',
                        `docker build -t ${imageRegistry.repositoryUri} .`,
                        `docker tag ${imageRegistry.repositoryUri}:latest ${imageRegistry.repositoryUri}:$CODEBUILD_RESOLVED_SOURCE_VERSION`,
                        `docker push --all-tags ${imageRegistry.repositoryUri}`,
                        'cd ..',
                    ],
                },
                post_build: {
                    commands: [
                        // Pass the full image URI to the deploy stage
                        `printf '[{"name":"${process.env.PROJECT_DEPLOYMENT_NAME}","imageUri":"%s"}]' "${imageRegistry.repositoryUri}:$CODEBUILD_RESOLVED_SOURCE_VERSION" > imagedefinitions.json`,
                    ],
                },
            },
            artifacts: {
                files: ['imagedefinitions.json'],
            },
            cache: {
                paths: ['/root/.m2/**/*'],
            },
        });

        this.project = new PipelineProject(this, 'Project', {
            projectName: 'eks-fargate-build-app',
            role: codeBuildRole.role,
            environment: {
                computeType: ComputeType.SMALL,
                buildImage: LinuxBuildImage.STANDARD_7_0,
                privileged: true,
            },
            buildSpec,
            cache: Cache.bucket(artifactBucket.bucket, { prefix: 'cache' }),
            logging: { cloudWatch: { logGroup } },
        });
    }
}
