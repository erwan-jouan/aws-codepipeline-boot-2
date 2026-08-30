package bluegreen.web.asg;

import bluegreen.model.Ec2ControlDto;
import bluegreen.service.asg.WatchAsgUpdatePolicyService;
import bluegreen.web.AbstractBlueGreenController;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ResponseBody;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import static bluegreen.model.Constant.ASG_ROLLING_UPDATE_PROFILE;
import static bluegreen.model.Constant.ID;

@Controller
@Profile(ASG_ROLLING_UPDATE_PROFILE)
public class AsgRollingUpdateController extends AbstractBlueGreenController {

    @Autowired
    private WatchAsgUpdatePolicyService watchAsgUpdatePolicyService;

    @GetMapping("/" + ASG_ROLLING_UPDATE_PROFILE)
    public String asgUpdatePolicyPage(final Model model) {
        model.addAttribute("color", this.color);
        final Ec2ControlDto ec2ControlDto = this.watchAsgUpdatePolicyService.watch();
        model.addAttribute("ec2ControlDto", ec2ControlDto);
        return ASG_ROLLING_UPDATE_PROFILE;
    }

    @GetMapping("/" + ASG_ROLLING_UPDATE_PROFILE + "/data")
    @ResponseBody
    public Map<String, Object> asgData() {
        final Ec2ControlDto dto = this.watchAsgUpdatePolicyService.watch();
        final List<Map<String, Object>> instances = dto.getControlTable().getRows().stream()
                .map(row -> {
                    final Map<String, Object> inst = new HashMap<>();
                    inst.put("isCurrent", "X".equals(row.get("#")));
                    inst.put("id", String.valueOf(row.getOrDefault(ID, "")));
                    inst.put("launchTime", String.valueOf(row.getOrDefault("LaunchTime", "")));
                    inst.put("instanceState", String.valueOf(row.getOrDefault("InstanceState", "")));
                    inst.put("asgLifeCycle", String.valueOf(row.getOrDefault("AsgLifeCycle", "")));
                    inst.put("elbHc", String.valueOf(row.getOrDefault("ElbHc", "")));
                    return inst;
                })
                .collect(Collectors.toList());
        final Map<String, Object> result = new HashMap<>();
        result.put("instanceId", dto.getInstanceInfo() != null ? dto.getInstanceInfo().getInstanceId() : "unknown");
        result.put("instances", instances);
        result.put("events", dto.getEvents() != null ? dto.getEvents() : List.of());
        result.put("color", this.color);
        return result;
    }

}
