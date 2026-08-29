package bluegreen.service.asg;

import bluegreen.model.AsgInfo;
import bluegreen.model.ControlTable;
import bluegreen.model.Ec2ControlDto;
import bluegreen.service.HasEc2Utils;
import bluegreen.service.WatchAwsService;
import bluegreen.service.elb.ElasticLoadBalancerService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Profile;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Service;
import software.amazon.awssdk.regions.internal.util.EC2MetadataUtils;
import software.amazon.awssdk.services.autoscaling.AutoScalingClient;
import software.amazon.awssdk.services.autoscaling.model.DescribeScalingActivitiesRequest;
import software.amazon.awssdk.services.autoscaling.model.DescribeScalingActivitiesResponse;
import software.amazon.awssdk.services.codedeploy.CodeDeployClient;
import software.amazon.awssdk.services.codedeploy.model.DeploymentGroupInfo;
import software.amazon.awssdk.services.codedeploy.model.GetDeploymentGroupRequest;
import software.amazon.awssdk.services.codedeploy.model.GetDeploymentGroupResponse;
import software.amazon.awssdk.services.ec2.Ec2Client;
import software.amazon.awssdk.services.ec2.model.DescribeInstancesRequest;
import software.amazon.awssdk.services.ec2.model.DescribeInstancesResponse;
import software.amazon.awssdk.core.exception.SdkException;
import software.amazon.awssdk.services.ec2.model.Ec2Exception;
import software.amazon.awssdk.services.ec2.model.Filter;
import software.amazon.awssdk.services.ec2.model.Instance;
import software.amazon.awssdk.services.ec2.model.Reservation;
import software.amazon.awssdk.services.elasticloadbalancingv2.model.TargetHealthDescription;

import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

import static bluegreen.model.Constant.ASG_EC2_IMAGE_BUILDER_PROFILE;
import static bluegreen.model.Constant.ASG_LIFECYCLE_HOOK_PROFILE;
import static bluegreen.model.Constant.ASG_ROLLING_UPDATE_PROFILE;
import static bluegreen.model.Constant.CLOUDFRONT_PROFILE;
import static bluegreen.model.Constant.ID;
import static bluegreen.model.Constant.PROJECT_NAME;

@Service
@Profile({ASG_ROLLING_UPDATE_PROFILE, ASG_LIFECYCLE_HOOK_PROFILE, CLOUDFRONT_PROFILE, ASG_EC2_IMAGE_BUILDER_PROFILE})
public class WatchAsgUpdatePolicyService implements WatchAwsService<Ec2ControlDto>, HasEc2Utils {

    @Autowired
    private Ec2Client ec2Client;

    @Autowired
    private AutoScalingClient autoScalingClient;

    @Autowired
    private CodeDeployClient codeDeployClient;

    @Autowired
    private AutoScalingGroupService autoScalingGroupService;

    @Autowired
    private ElasticLoadBalancerService elasticLoadBalancerService;

    @Autowired
    private EC2MetadataUtils.InstanceInfo instanceInfo;

    @Autowired
    private Environment environment;

    public static final int MAX_RESULTS = 10;
    public static final List<String> HEADERS = List.of(
            "#", ID, "LaunchTime", "InstanceState",
            "AsgName", "AsgLifeCycle", "LtVersion", "ElbHc");

    public static final String TABLE_NAME = "EC2 CodeDeploy";

    @Override
    public Ec2ControlDto watch() {
        final List<Map<String, Object>> rows = new ArrayList<>();
        final List<Instance> instances = new ArrayList<>();
        try {
            this.getEc2Instances(instances);
            final List<String> instanceIds = instances.stream().map(Instance::instanceId).collect(Collectors.toList());
            final Map<String, AsgInfo> instancesAsg = this.autoScalingGroupService.getInstancesAsg(instanceIds);
            final Map<String, TargetHealthDescription> instancesHealthes = this.elasticLoadBalancerService.get();

            instances.stream()
                    .filter(instance -> instancesAsg.containsKey(instance.instanceId()))
                    .forEach(instance -> {
                        final String instanceId = instance.instanceId();
                        final AsgInfo asgInfo = instancesAsg.get(instanceId);
                        rows.add(
                                Map.of("#", this.isFrom(instance),
                                        ID, this.safe(instance::instanceId),
                                        "LaunchTime", this.safe(instance::launchTime),
                                        "InstanceState", this.getInstanceState(instance),
                                        "AsgName", this.safe(asgInfo::getAsgName),
                                        "LtVersion", this.safe(asgInfo::getLaunchTemplateVersion),
                                        "ElbHc", this.getElbHealthCheck(instanceId, instancesHealthes),
                                        "AsgLifeCycle", this.safe(asgInfo::getLifecycleState)));
                    });
            final ControlTable controlTable = ControlTable.builder()
                    .tableName(TABLE_NAME)
                    .headers(HEADERS)
                    .rows(rows)
                    .build();
            return Ec2ControlDto.builder()
                    .controlTable(controlTable)
                    .instanceInfo(this.instanceInfo)
                    .events(this.getRecentScalingActivities())
                    .build();
        } catch (final Ec2Exception ec2Exception) {
            System.err.println(ec2Exception.awsErrorDetails().errorCode());
            return emptyDto();
        } catch (final SdkException e) {
            System.err.println(e.getMessage());
            return emptyDto();
        }

    }

    private Ec2ControlDto emptyDto() {
        final ControlTable empty = ControlTable.builder().headers(HEADERS).rows(List.of()).build();
        return Ec2ControlDto.builder().instanceInfo(this.instanceInfo).controlTable(empty).events(List.of()).build();
    }

    private static final DateTimeFormatter ACTIVITY_FMT =
            DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss").withZone(ZoneId.of("Europe/Paris"));

    private List<String> getRecentScalingActivities() {
        try {
            final DescribeScalingActivitiesRequest request = DescribeScalingActivitiesRequest.builder()
                    .autoScalingGroupName(this.getProjectDeploymentName())
                    .maxRecords(5)
                    .build();
            final DescribeScalingActivitiesResponse response = this.autoScalingClient.describeScalingActivities(request);
            return response.activities().stream()
                    .map(a -> ACTIVITY_FMT.format(a.startTime()) + " – " + a.description())
                    .collect(Collectors.toList());
        } catch (final Exception e) {
            return List.of();
        }
    }

    private void getEc2Instances(final List<Instance> instances) {
        String nextToken = null;
        do {
            final Filter filter = Filter.builder()
                    .name("tag:aws:autoscaling:groupName")
                    .values(this.getProjectDeploymentName())
                    .build();
            final DescribeInstancesRequest request = DescribeInstancesRequest.builder()
                    .filters(filter)
                    .maxResults(MAX_RESULTS)
                    .nextToken(nextToken)
                    .build();
            final DescribeInstancesResponse response = this.ec2Client.describeInstances(request);
            response.reservations()
                    .stream()
                    .map(Reservation::instances)
                    .flatMap(Collection::stream)
                    .sorted(Comparator.comparing(Instance::launchTime))
                    .forEach(instances::add);
            nextToken = response.nextToken();
        } while (nextToken != null);
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
}
