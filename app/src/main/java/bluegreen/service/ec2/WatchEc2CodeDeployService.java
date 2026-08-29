package bluegreen.service.ec2;

import bluegreen.model.CodeDeployControlDto;
import bluegreen.model.CodeDeployInstance;
import bluegreen.model.ControlTable;
import bluegreen.service.HasEc2Utils;
import bluegreen.service.WatchAwsService;
import bluegreen.service.elb.ElasticLoadBalancerService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Profile;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Service;
import software.amazon.awssdk.regions.internal.util.EC2MetadataUtils;
import software.amazon.awssdk.services.codedeploy.CodeDeployClient;
import software.amazon.awssdk.services.codedeploy.model.*;
import software.amazon.awssdk.services.ec2.Ec2Client;
import software.amazon.awssdk.services.ec2.model.*;
import software.amazon.awssdk.services.elasticloadbalancingv2.model.TargetHealthDescription;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.stream.Collectors;

import static bluegreen.model.Constant.ASG_CODE_DEPLOY_EC2_PROFILE;
import static bluegreen.model.Constant.ID;
import static bluegreen.model.Constant.PROJECT_NAME;

@Service
@Profile(ASG_CODE_DEPLOY_EC2_PROFILE)
public class WatchEc2CodeDeployService implements WatchAwsService<CodeDeployControlDto>, HasEc2Utils {

    @Autowired
    private Ec2Client ec2Client;

    @Autowired
    private CodeDeployClient codeDeployClient;

    @Autowired
    private EC2MetadataUtils.InstanceInfo instanceInfo;

    @Autowired
    private Environment environment;

    @Autowired
    private ElasticLoadBalancerService elasticLoadBalancerService;

    public static final int MAX_RESULTS = 10;
    public static final List<String> HEADERS = List.of("#", ID,
            "State", "deploymentId",
            "targetStatus", "lifecycleEventName",
            "lastUpdated", "ElbHc");
    public static final String TABLE_NAME = "EC2 CodeDeploy";

    @Override
    public CodeDeployControlDto watch() {
        final List<Map<String, Object>> rows = new ArrayList<>();
        String nextToken = null;
        try {
            do {
                final DescribeInstancesResponse response = this.getEc2Reservations(nextToken);
                final List<String> lastDeploymentIds = this.getLastDeploymentIds();
                final Map<String, TargetHealthDescription> instancesHealth = this.elasticLoadBalancerService.get();
                response.reservations().stream()
                        .map(Reservation::instances)
                        .flatMap(Collection::stream)
                        .filter(this::isNotTerminated)
                        .sorted(Comparator.comparing(Instance::launchTime))
                        .forEach(instance -> {
                            final Optional<CodeDeployInstance> codeDeployInstance = this.addDeploymentInfo(instance, lastDeploymentIds);
                            rows.add(
                                    Map.of("#", this.isFrom(instance),
                                            ID, this.safe(instance::instanceId),
                                            "State", this.getInstanceState(instance),
                                            "deploymentId", codeDeployInstance.map(CodeDeployInstance::deploymentId).orElse(""),
                                            "targetStatus", codeDeployInstance.map(CodeDeployInstance::targetStatus).orElse(TargetStatus.UNKNOWN),
                                            "lifecycleEventName", codeDeployInstance.map(CodeDeployInstance::lifecycleEventName).orElse(""),
                                            "lastUpdated", codeDeployInstance.map(CodeDeployInstance::lastUpdated).orElse(instance.launchTime()),
                                            "ElbHc", this.getElbHealthCheck(instance.instanceId(), instancesHealth)
                                    ));
                        });
                nextToken = response.nextToken();
            } while (nextToken != null);
            final ControlTable controlTable = ControlTable.builder()
                    .tableName(TABLE_NAME)
                    .headers(HEADERS)
                    .rows(rows)
                    .build();
            final DeploymentGroupInfo deploymentGroupInfo = this.getDeploymentGroupInfo();
            return CodeDeployControlDto.builder()
                    .controlTable(controlTable)
                    .instanceInfo(this.instanceInfo)
                    .deploymentConfigName(this.getDeploymentConfigName(deploymentGroupInfo))
                    .deploymentType(deploymentGroupInfo.deploymentStyle().deploymentTypeAsString())
                    .deploymentOption(deploymentGroupInfo.deploymentStyle().deploymentOptionAsString())
                    .build();
        } catch (final Ec2Exception e) {
            System.err.println(e.awsErrorDetails().errorCode());
            return CodeDeployControlDto.builder().build();
        }
    }

    private String getDeploymentConfigName(final DeploymentGroupInfo deploymentGroupInfo) {
        final DeploymentType deploymentType = deploymentGroupInfo.deploymentStyle().deploymentType();
        if (DeploymentType.BLUE_GREEN.equals(deploymentType)) {
            return "--"; // not relevant in this case
        } else {
            return deploymentGroupInfo.deploymentConfigName();
        }
    }

    private boolean isNotTerminated(final Instance instance) {
        final InstanceStateName name = instance.state().name();
        return !InstanceStateName.TERMINATED.equals(name);
    }

    private DescribeInstancesResponse getEc2Reservations(final String nextToken) {
        final Filter relatesToProject = Filter.builder()
                .name("tag:ProjectDeploymentName")
                .values(this.getProjectDeploymentName())
                .build();
        final DescribeInstancesRequest request = DescribeInstancesRequest.builder()
                .filters(relatesToProject)
                .maxResults(MAX_RESULTS)
                .nextToken(nextToken)
                .build();
        return this.ec2Client.describeInstances(request);
    }

    private String isFrom(final Instance instance) {
        final String rowInstanceId = instance.instanceId();
        final String calledInstanceId = this.instanceInfo.getInstanceId();
        return Optional.ofNullable(calledInstanceId)
                .filter(calledId -> calledId.equals(rowInstanceId))
                .map(i -> "X")
                .orElse("");
    }

    private DeploymentGroupInfo getDeploymentGroupInfo() {
        final GetDeploymentGroupRequest request = GetDeploymentGroupRequest.builder()
                .applicationName(this.getProjectDeploymentName())
                .deploymentGroupName(this.getProjectDeploymentName())
                .build();
        final GetDeploymentGroupResponse deploymentGroup = this.codeDeployClient.getDeploymentGroup(request);
        return deploymentGroup.deploymentGroupInfo();
    }

    private String getProjectDeploymentName() {
        final String activeProfile = this.getActiveProfile();
        return String.format("%s-%s", PROJECT_NAME, activeProfile);
    }

    private String getActiveProfile() {
        return this.environment.getActiveProfiles()[0];
    }

    private Optional<CodeDeployInstance> addDeploymentInfo(final Instance instance, final List<String> lastDeploymentIds) {
        final String instanceId = instance.instanceId();
        return lastDeploymentIds.stream()
                .map(deploymentId -> this.batchGetDeploymentTargets(deploymentId, instanceId))
                .map(deploymentTarget -> this.getCodeDeployInstance(instance, deploymentTarget))
                .filter(codeDeployInstance -> Objects.nonNull(codeDeployInstance.lastUpdated()))
                .sorted(Comparator.comparing(CodeDeployInstance::lastUpdated).reversed())
                .findFirst();
    }

    private CodeDeployInstance getCodeDeployInstance(final Instance instance, final Optional<DeploymentTarget> optDeploymentTarget) {
        final CodeDeployInstance codeDeployInstance = new CodeDeployInstance(instance);
        optDeploymentTarget.ifPresent(deploymentTarget -> {
            final InstanceTarget instanceTarget = deploymentTarget.instanceTarget(); // ec2 only
            codeDeployInstance.setLastUpdated(instanceTarget.lastUpdatedAt());
            codeDeployInstance.setTargetStatus(instanceTarget.status());
            codeDeployInstance.setDeploymentId(instanceTarget.deploymentId());
            this.setLifecycleEvent(codeDeployInstance, instanceTarget);
        });
        return codeDeployInstance;
    }

    private void setLifecycleEvent(final CodeDeployInstance codeDeployInstance, final InstanceTarget instanceTarget) {
        final List<LifecycleEvent> lifecycleEvents = instanceTarget.lifecycleEvents();
        final Optional<LifecycleEvent> lastLifeCycleEvent = lifecycleEvents
                .stream()
                .filter(lifecycleEvent -> Objects.nonNull(lifecycleEvent.startTime()))
                .sorted(Comparator.comparing(LifecycleEvent::startTime).reversed())
                .findFirst();
        final String lifecycleEventName = lastLifeCycleEvent.isPresent() ? lastLifeCycleEvent.get().lifecycleEventName() : "";
        codeDeployInstance.setLifecycleEventName(lifecycleEventName);
    }

    private void dump(final CodeDeployInstance codeDeployInstance, final LifecycleEvent lifecycleEvent) {
        System.out.println(lifecycleEvent);
    }

    private Instant getLastUpdated(final Instance instance, final List<DeploymentTarget> deploymentTargets) {
        return deploymentTargets.stream()
                .filter(deploymentTarget -> instance.instanceId().equals(deploymentTarget.instanceTarget().targetId()))
                .map(deploymentTarget -> deploymentTarget.instanceTarget().lastUpdatedAt())
                .findFirst()
                .orElse(null);
    }

    private TargetStatus getDeploymentStatus(final Instance instance, final List<DeploymentTarget> deploymentTargets) {
        return deploymentTargets.stream()
                .filter(deploymentTarget -> instance.instanceId().equals(deploymentTarget.instanceTarget().targetId()))
                .map(deploymentTarget -> deploymentTarget.instanceTarget().status())
                .findFirst()
                .orElse(TargetStatus.UNKNOWN);
    }

    private List<String> getLastDeploymentIds() {
        final TimeRange timeRange = TimeRange.builder()
                .start(Instant.now().minus(1, ChronoUnit.DAYS))
                .end(Instant.now())
                .build();
        final ListDeploymentsRequest listDeploymentsRequest = ListDeploymentsRequest.builder()
                .createTimeRange(timeRange)
                .build();
        final List<String> allDeploymentIds = this.codeDeployClient
                .listDeployments(listDeploymentsRequest)
                .deployments().stream().collect(Collectors.toList());
        final List<String> toReturn = new ArrayList<>();
        final Iterator<String> iterator = allDeploymentIds.iterator();
        if (iterator.hasNext()) { // last deployment if exists
            toReturn.add(iterator.next());
        }
        if (iterator.hasNext()) { // before last deployment if existss
            toReturn.add(iterator.next());
        }
        return toReturn;
    }

    Optional<DeploymentTarget> batchGetDeploymentTargets(final String deploymentId, final String targetId) {
        final BatchGetDeploymentTargetsRequest request = BatchGetDeploymentTargetsRequest.builder()
                .deploymentId(deploymentId)
                .targetIds(targetId)
                .build();
        final List<DeploymentTarget> collect = this.codeDeployClient.batchGetDeploymentTargets(request)
                .deploymentTargets()
                .stream()
                .collect(Collectors.toList());
        return collect.size() > 0 ? Optional.of(collect.get(0)) : Optional.empty(); // first is most recent
    }

}
