import { computed, onMounted, reactive, ref } from "vue";
import { ElButton, ElDialog, ElInput, ElInputNumber, ElMessage, ElMessageBox, ElOption, ElSelect, ElSwitch } from "element-plus";
import "element-plus/dist/index.css";
import { ArrowLeft, Check, CheckCircle2, CircleAlert, KeyRound, LoaderCircle, Pencil, Plus, RefreshCw, Search, Settings2, Trash2, XCircle } from "@lucide/vue";
import * as channelApi from "@/services/channels";
const channels = ref([]);
const protocols = ref([]);
const loading = ref(true);
const saving = ref(false);
const testingId = ref("");
const syncingId = ref("");
const query = ref("");
const status = ref("all");
const simulatorModel = ref("");
const simulatorSize = ref("16:9");
const simulatorQuality = ref("2K");
const simulation = ref(null);
const simulating = ref(false);
const statsWindow = ref("24h");
const runtimeStats = ref(null);
const dialogOpen = ref(false);
const onboardingStep = ref(0);
const editingId = ref("");
const modelDialogOpen = ref(false);
const editingModelId = ref("");
const routingDefaults = { priority: 100, weight: 100, maxConcurrency: 4, timeoutSeconds: 300, failureThreshold: 3, cooldownSeconds: 60 };
const channelForm = reactive({ name: "", baseUrl: "", protocol: "openai", apiKey: "", enabled: false, advancedConfig: emptyAdvancedConfig(), ...routingDefaults });
const modelForm = reactive({ modelId: "", displayName: "", capability: "image", enabled: true, sortOrder: 0 });
const editingChannel = computed(() => channels.value.find((channel) => channel.id === editingId.value));
const imageModels = computed(() => Array.from(new Set(channels.value.flatMap(channel => channel.models.filter(model => model.capability === "image" && model.enabled).map(model => model.modelId)))));
const filteredChannels = computed(() => {
    const keyword = query.value.trim().toLowerCase();
    return channels.value.filter((channel) => {
        if (status.value === "enabled" && !channel.enabled)
            return false;
        if (status.value === "disabled" && channel.enabled)
            return false;
        if (!keyword)
            return true;
        return [channel.name, channel.baseUrl, channel.protocol, ...channel.models.flatMap((model) => [model.modelId, model.displayName])].some((value) => value.toLowerCase().includes(keyword));
    });
});
const enabledCount = computed(() => channels.value.filter((channel) => channel.enabled).length);
const modelCount = computed(() => channels.value.reduce((count, channel) => count + channel.models.length, 0));
const enabledModelCount = computed(() => channels.value.reduce((count, channel) => count + channel.models.filter((model) => model.enabled).length, 0));
const capabilityCounts = computed(() => Object.fromEntries(["text", "image", "video", "audio"].map((capability) => [capability, channels.value.reduce((count, channel) => count + channel.models.filter((model) => model.enabled && model.capability === capability).length, 0)])));
const selectedProtocol = computed(() => protocols.value.find((protocol) => protocol.id === channelForm.protocol));
const protocolLabels = computed(() => Object.fromEntries(protocols.value.map((protocol) => [protocol.id, protocol.label])));
onMounted(() => void Promise.all([loadChannels(), loadProtocols(), loadStats()]));
async function runSimulation() { if (!simulatorModel.value)
    return ElMessage.warning("请选择图片模型"); simulating.value = true; try {
    simulation.value = await channelApi.simulateRoute({ model: simulatorModel.value, size: simulatorSize.value, quality: simulatorQuality.value });
}
catch (error) {
    ElMessage.error(messageOf(error, "路由模拟失败"));
}
finally {
    simulating.value = false;
} }
async function loadStats() { try {
    runtimeStats.value = await channelApi.getChannelStats(statsWindow.value);
}
catch (error) {
    ElMessage.error(messageOf(error, "渠道统计加载失败"));
} }
async function loadProtocols() {
    try {
        protocols.value = await channelApi.listProtocols();
    }
    catch (error) {
        ElMessage.error(messageOf(error, "协议注册表加载失败"));
    }
}
async function loadChannels() {
    loading.value = true;
    try {
        channels.value = await channelApi.listChannels();
        if (!imageModels.value.includes(simulatorModel.value))
            simulatorModel.value = imageModels.value[0] || "";
    }
    catch (error) {
        ElMessage.error(messageOf(error, "渠道加载失败"));
    }
    finally {
        loading.value = false;
    }
}
function openCreate() {
    editingId.value = "";
    onboardingStep.value = 0;
    Object.assign(channelForm, { name: "", baseUrl: "", protocol: "openai", apiKey: "", enabled: false, advancedConfig: emptyAdvancedConfig(), ...routingDefaults });
    dialogOpen.value = true;
}
function openEdit(channel) {
    editingId.value = channel.id;
    onboardingStep.value = 1;
    Object.assign(channelForm, { name: channel.name, baseUrl: channel.baseUrl, protocol: channel.protocol, apiKey: "", enabled: channel.enabled, advancedConfig: cloneData(channel.advancedConfig), priority: channel.priority, weight: channel.weight, maxConcurrency: channel.maxConcurrency, timeoutSeconds: channel.timeoutSeconds, failureThreshold: channel.failureThreshold, cooldownSeconds: channel.cooldownSeconds });
    dialogOpen.value = true;
}
function chooseProtocol(protocol) {
    channelForm.protocol = protocol.id;
    channelForm.baseUrl = protocol.defaultBaseUrl || "";
    channelForm.advancedConfig = advancedFromProtocol(protocol);
}
function continueOnboarding() {
    const protocol = selectedProtocol.value;
    if (!protocol)
        return ElMessage.warning("请选择协议");
    if (!channelForm.name)
        channelForm.name = `${protocol.label} 渠道`;
    onboardingStep.value = 1;
}
async function saveChannel() {
    if (!channelForm.name.trim() || !channelForm.baseUrl.trim())
        return ElMessage.warning("请填写渠道名称和 Base URL");
    if (!editingId.value && selectedProtocol.value?.authMode !== "none" && !channelForm.apiKey?.trim())
        return ElMessage.warning("当前协议必须填写 API Key");
    saving.value = true;
    try {
        const wasEditing = Boolean(editingId.value);
        const saved = editingId.value ? await channelApi.updateChannel(editingId.value, channelForm) : await channelApi.createChannel(channelForm);
        editingId.value = saved.id;
        channelForm.apiKey = "";
        await loadChannels();
        ElMessage.success(wasEditing ? "渠道配置已保存" : "渠道已创建");
    }
    catch (error) {
        ElMessage.error(messageOf(error, "渠道保存失败"));
    }
    finally {
        saving.value = false;
    }
}
async function toggleChannel(channel, enabled) {
    try {
        await channelApi.updateChannel(channel.id, { name: channel.name, baseUrl: channel.baseUrl, protocol: channel.protocol, enabled, advancedConfig: channel.advancedConfig, priority: channel.priority, weight: channel.weight, maxConcurrency: channel.maxConcurrency, timeoutSeconds: channel.timeoutSeconds, failureThreshold: channel.failureThreshold, cooldownSeconds: channel.cooldownSeconds });
        await loadChannels();
        ElMessage.success(enabled ? "渠道已启用" : "渠道已停用");
    }
    catch (error) {
        ElMessage.error(messageOf(error, "渠道状态更新失败"));
    }
}
async function removeChannel(channel) {
    try {
        await ElMessageBox.confirm(`将删除渠道“${channel.name}”及其全部模型配置，继续吗？`, "删除模型渠道", { type: "warning", confirmButtonText: "删除", cancelButtonText: "取消" });
        await channelApi.deleteChannel(channel.id);
        if (editingId.value === channel.id)
            dialogOpen.value = false;
        await loadChannels();
        ElMessage.success("渠道已删除");
    }
    catch (error) {
        if (error === "cancel" || error === "close")
            return;
        ElMessage.error(messageOf(error, "渠道删除失败"));
    }
}
async function testChannel(channel) {
    testingId.value = channel.id;
    try {
        const result = await channelApi.testChannel(channel.id);
        await loadChannels();
        result.status === "success" ? ElMessage.success(result.message) : ElMessage.error(result.message);
    }
    catch (error) {
        ElMessage.error(messageOf(error, "渠道测试失败"));
    }
    finally {
        testingId.value = "";
    }
}
async function syncModels(channel) {
    syncingId.value = channel.id;
    try {
        const result = await channelApi.syncChannelModels(channel.id);
        await loadChannels();
        result.status === "success" ? ElMessage.success(result.message) : ElMessage.error(result.message);
    }
    catch (error) {
        ElMessage.error(messageOf(error, "模型同步失败"));
    }
    finally {
        syncingId.value = "";
    }
}
function openModel(model) {
    editingModelId.value = model?.id || "";
    Object.assign(modelForm, {
        modelId: model?.modelId || "",
        displayName: model?.displayName || "",
        capability: model?.capability || "image",
        enabled: model?.enabled ?? true,
        sortOrder: model?.sortOrder ?? (editingChannel.value?.models.length || 0),
    });
    modelDialogOpen.value = true;
}
async function saveModel() {
    const channel = editingChannel.value;
    if (!channel || !modelForm.modelId.trim())
        return ElMessage.warning("请填写模型 ID");
    saving.value = true;
    try {
        if (editingModelId.value)
            await channelApi.updateChannelModel(channel.id, editingModelId.value, modelForm);
        else
            await channelApi.createChannelModel(channel.id, modelForm);
        await loadChannels();
        modelDialogOpen.value = false;
        ElMessage.success(editingModelId.value ? "模型已更新" : "模型已添加");
    }
    catch (error) {
        ElMessage.error(messageOf(error, "模型保存失败"));
    }
    finally {
        saving.value = false;
    }
}
async function removeModel(model) {
    const channel = editingChannel.value;
    if (!channel)
        return;
    try {
        await ElMessageBox.confirm(`删除模型“${model.displayName}”？`, "删除模型", { type: "warning", confirmButtonText: "删除", cancelButtonText: "取消" });
        await channelApi.deleteChannelModel(channel.id, model.id);
        await loadChannels();
        ElMessage.success("模型已删除");
    }
    catch (error) {
        if (error === "cancel" || error === "close")
            return;
        ElMessage.error(messageOf(error, "模型删除失败"));
    }
}
function statusText(channel) {
    if (!channel.enabled)
        return "已停用";
    if (channel.cooldownUntil && new Date(channel.cooldownUntil).getTime() > Date.now())
        return "冷却中";
    if (channel.consecutiveFailures > 0)
        return "运行异常";
    if (channel.lastTestStatus === "failed")
        return "连接异常";
    return "已启用";
}
function capabilityLabel(capability) {
    return { text: "文本", image: "图片", video: "视频", audio: "音频" }[capability];
}
function advancedFromProtocol(protocol) {
    const primary = protocol.capabilities.length === 1 ? protocol.operations[protocol.capabilities[0]] || {} : {};
    return {
        apiFormat: protocol.apiFormat,
        authMode: protocol.authMode,
        modelCatalogPaths: [...protocol.modelCatalogPaths],
        operationConfigs: cloneData(protocol.operations),
        ...primary,
    };
}
function emptyAdvancedConfig() {
    return { apiFormat: "openai", authMode: "bearer", modelCatalogPaths: [], operationConfigs: {} };
}
function cloneData(value) {
    return JSON.parse(JSON.stringify(value));
}
function messageOf(error, fallback) {
    return error instanceof Error && error.message ? error.message : fallback;
}
const __VLS_ctx = {};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
void __VLS_ctx, __VLS_components, __VLS_intrinsics, __VLS_directives;
// @ts-ignore
__VLS_withDotValue(channels, {});
// @ts-ignore
__VLS_withDotValue(capabilityCounts, {});
// @ts-ignore
__VLS_withDotValue(simulation, {});
// @ts-ignore
__VLS_withDotValue(statsWindow, {});
// @ts-ignore
__VLS_withDotValue(runtimeStats, {});
// @ts-ignore
__VLS_withDotValue(loading, {});
// @ts-ignore
__VLS_withDotValue(filteredChannels, {});
// @ts-ignore
__VLS_withDotValue(protocolLabels, {});
// @ts-ignore
__VLS_withDotValue(testingId, {});
// @ts-ignore
__VLS_withDotValue(syncingId, {});
// @ts-ignore
__VLS_withDotValue(editingId, {});
// @ts-ignore
__VLS_withDotValue(onboardingStep, {});
// @ts-ignore
__VLS_withDotValue(channelForm, {});
// @ts-ignore
__VLS_withDotValue(selectedProtocol, {});
// @ts-ignore
__VLS_withDotValue(editingChannel, {});
// @ts-ignore
__VLS_withDotValue(dialogOpen, {});
// @ts-ignore
__VLS_withDotValue(editingModelId, {});
// @ts-ignore
__VLS_withDotValue(modelForm, {});
// @ts-ignore
__VLS_withDotValue(modelDialogOpen, {});
__VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
    ...{ class: "channels-workspace" },
});
/** @type {__VLS_StyleScopedClasses['channels-workspace']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "channel-metrics" },
});
/** @type {__VLS_StyleScopedClasses['channel-metrics']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
(__VLS_unwrap(enabledCount, {}));
(channels.value.length);
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
(__VLS_unwrap(modelCount, {}));
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
(__VLS_unwrap(enabledModelCount, {}));
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({
    ...{ class: "channel-capability-metric" },
});
/** @type {__VLS_StyleScopedClasses['channel-capability-metric']} */ ;
(capabilityCounts.value.text);
(capabilityCounts.value.image);
(capabilityCounts.value.video);
(capabilityCounts.value.audio);
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "channel-observability" },
});
/** @type {__VLS_StyleScopedClasses['channel-observability']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "channel-observability__head" },
});
/** @type {__VLS_StyleScopedClasses['channel-observability__head']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
let __VLS_0;
/** @ts-ignore @type { | typeof __VLS_components.ElButton | typeof __VLS_components.ElButton} */
ElButton;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
    // @ts-ignore
    ...{ 'onClick': {} }, loading: (__VLS_unwrap(simulating, {})),
}));
const __VLS_2 = __VLS_1({
    ...{ 'onClick': {} },
    loading: (__VLS_unwrap(simulating, {})),
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
let __VLS_5;
const __VLS_6 = {
    /** @type {typeof __VLS_5.click} */
    onClick: (runSimulation),
};
void __VLS_6;
const { default: __VLS_7 } = __VLS_nonNull(__VLS_3.slots);
// @ts-ignore
[enabledCount, channels, modelCount, enabledModelCount, capabilityCounts, capabilityCounts, capabilityCounts, capabilityCounts, simulating,];
var __VLS_3;
var __VLS_4;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "channel-simulator-form" },
});
/** @type {__VLS_StyleScopedClasses['channel-simulator-form']} */ ;
let __VLS_8;
/** @ts-ignore @type { | typeof __VLS_components.ElSelect | typeof __VLS_components.ElSelect} */
ElSelect;
// @ts-ignore
const __VLS_9 = __VLS_asFunctionalComponent1(__VLS_8, new __VLS_8({
    // @ts-ignore
    modelValue: (__VLS_unwrap(simulatorModel, {})), placeholder: "选择图片模型",
}));
const __VLS_10 = __VLS_9({
    modelValue: (__VLS_unwrap(simulatorModel, {})),
    placeholder: "选择图片模型",
}, ...__VLS_functionalComponentArgsRest(__VLS_9));
const { default: __VLS_13 } = __VLS_nonNull(__VLS_11.slots);
const __VLS_14 = __VLS_tryAsConstant((__VLS_unwrap(imageModels, {})));
for (const [model] of __VLS_vFor(__VLS_nonNull(__VLS_14))) {
    let __VLS_15;
    /** @ts-ignore @type { | typeof __VLS_components.ElOption} */
    ElOption;
    // @ts-ignore
    const __VLS_16 = __VLS_asFunctionalComponent1(__VLS_15, new __VLS_15({
        // @ts-ignore
        key: (model), label: (model), value: (model),
    }));
    const __VLS_17 = __VLS_16({
        key: (model),
        label: (model),
        value: (model),
    }, ...__VLS_functionalComponentArgsRest(__VLS_16));
    // @ts-ignore
    [simulatorModel, imageModels,];
}
// @ts-ignore
[];
var __VLS_11;
let __VLS_20;
/** @ts-ignore @type { | typeof __VLS_components.ElSelect | typeof __VLS_components.ElSelect} */
ElSelect;
// @ts-ignore
const __VLS_21 = __VLS_asFunctionalComponent1(__VLS_20, new __VLS_20({
    // @ts-ignore
    modelValue: (__VLS_unwrap(simulatorSize, {})),
}));
const __VLS_22 = __VLS_21({
    modelValue: (__VLS_unwrap(simulatorSize, {})),
}, ...__VLS_functionalComponentArgsRest(__VLS_21));
const { default: __VLS_25 } = __VLS_nonNull(__VLS_23.slots);
let __VLS_26;
/** @ts-ignore @type { | typeof __VLS_components.ElOption} */
ElOption;
// @ts-ignore
const __VLS_27 = __VLS_asFunctionalComponent1(__VLS_26, new __VLS_26({
    // @ts-ignore
    label: "1:1", value: "1:1",
}));
const __VLS_28 = __VLS_27({
    label: "1:1",
    value: "1:1",
}, ...__VLS_functionalComponentArgsRest(__VLS_27));
let __VLS_31;
/** @ts-ignore @type { | typeof __VLS_components.ElOption} */
ElOption;
// @ts-ignore
const __VLS_32 = __VLS_asFunctionalComponent1(__VLS_31, new __VLS_31({
    // @ts-ignore
    label: "16:9", value: "16:9",
}));
const __VLS_33 = __VLS_32({
    label: "16:9",
    value: "16:9",
}, ...__VLS_functionalComponentArgsRest(__VLS_32));
let __VLS_36;
/** @ts-ignore @type { | typeof __VLS_components.ElOption} */
ElOption;
// @ts-ignore
const __VLS_37 = __VLS_asFunctionalComponent1(__VLS_36, new __VLS_36({
    // @ts-ignore
    label: "9:16", value: "9:16",
}));
const __VLS_38 = __VLS_37({
    label: "9:16",
    value: "9:16",
}, ...__VLS_functionalComponentArgsRest(__VLS_37));
// @ts-ignore
[simulatorSize,];
var __VLS_23;
let __VLS_41;
/** @ts-ignore @type { | typeof __VLS_components.ElSelect | typeof __VLS_components.ElSelect} */
ElSelect;
// @ts-ignore
const __VLS_42 = __VLS_asFunctionalComponent1(__VLS_41, new __VLS_41({
    // @ts-ignore
    modelValue: (__VLS_unwrap(simulatorQuality, {})),
}));
const __VLS_43 = __VLS_42({
    modelValue: (__VLS_unwrap(simulatorQuality, {})),
}, ...__VLS_functionalComponentArgsRest(__VLS_42));
const { default: __VLS_46 } = __VLS_nonNull(__VLS_44.slots);
let __VLS_47;
/** @ts-ignore @type { | typeof __VLS_components.ElOption} */
ElOption;
// @ts-ignore
const __VLS_48 = __VLS_asFunctionalComponent1(__VLS_47, new __VLS_47({
    // @ts-ignore
    label: "1K", value: "1K",
}));
const __VLS_49 = __VLS_48({
    label: "1K",
    value: "1K",
}, ...__VLS_functionalComponentArgsRest(__VLS_48));
let __VLS_52;
/** @ts-ignore @type { | typeof __VLS_components.ElOption} */
ElOption;
// @ts-ignore
const __VLS_53 = __VLS_asFunctionalComponent1(__VLS_52, new __VLS_52({
    // @ts-ignore
    label: "2K", value: "2K",
}));
const __VLS_54 = __VLS_53({
    label: "2K",
    value: "2K",
}, ...__VLS_functionalComponentArgsRest(__VLS_53));
// @ts-ignore
[simulatorQuality,];
var __VLS_44;
if (simulation.value) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "channel-route-list" },
    });
    /** @type {__VLS_StyleScopedClasses['channel-route-list']} */ ;
    const __VLS_57 = __VLS_tryAsConstant((simulation.value.candidates));
    for (const [candidate, index] of __VLS_vFor(__VLS_nonNull(__VLS_57))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.article, __VLS_intrinsics.article)({
            key: (candidate.channelId),
            ...{ class: ({ 'is-selected': candidate.selected }) },
        });
        /** @type {__VLS_StyleScopedClasses['is-selected']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.b, __VLS_intrinsics.b)({});
        (index + 1);
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
        (candidate.channelName);
        __VLS_asFunctionalElement1(__VLS_intrinsics.small, __VLS_intrinsics.small)({});
        (candidate.priority);
        (candidate.weight);
        (candidate.activeRequests);
        (candidate.maxConcurrency);
        __VLS_asFunctionalElement1(__VLS_intrinsics.em, __VLS_intrinsics.em)({});
        (candidate.selected ? '本次选择' : candidate.reason);
        if (candidate.failoverTo) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.small, __VLS_intrinsics.small)({});
            (candidate.failoverTo);
        }
        // @ts-ignore
        [simulation, simulation,];
    }
}
__VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "channel-observability__head" },
});
/** @type {__VLS_StyleScopedClasses['channel-observability__head']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "channel-window" },
});
/** @type {__VLS_StyleScopedClasses['channel-window']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: // @ts-ignore
        (...[$event]) => {
            void $event;
            statsWindow.value = '24h';
            loadStats();
            // @ts-ignore
            [statsWindow,];
        } },
    ...{ class: ({ active: statsWindow.value === '24h' }) },
});
/** @type {__VLS_StyleScopedClasses['active']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: // @ts-ignore
        (...[$event]) => {
            void $event;
            statsWindow.value = '7d';
            loadStats();
            // @ts-ignore
            [statsWindow, statsWindow,];
        } },
    ...{ class: ({ active: statsWindow.value === '7d' }) },
});
/** @type {__VLS_StyleScopedClasses['active']} */ ;
if (runtimeStats.value) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "channel-stats-summary" },
    });
    /** @type {__VLS_StyleScopedClasses['channel-stats-summary']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
    (runtimeStats.value.requests);
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
    (runtimeStats.value.successRate.toFixed(1));
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
    (Math.round(runtimeStats.value.averageLatencyMs));
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
    (runtimeStats.value.autoSwitches);
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
    (runtimeStats.value.peakConcurrency);
}
if (runtimeStats.value?.routes.length) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "channel-traffic-list" },
    });
    /** @type {__VLS_StyleScopedClasses['channel-traffic-list']} */ ;
    const __VLS_58 = __VLS_tryAsConstant((runtimeStats.value.routes));
    for (const [route] of __VLS_vFor(__VLS_nonNull(__VLS_58))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            key: (`${route.model}:${route.channelId}`),
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
        (route.channelName);
        __VLS_asFunctionalElement1(__VLS_intrinsics.small, __VLS_intrinsics.small)({});
        (route.model);
        (route.requests);
        (Math.round(route.averageLatencyMs));
        __VLS_asFunctionalElement1(__VLS_intrinsics.b, __VLS_intrinsics.b)({});
        (route.trafficShare.toFixed(1));
        // @ts-ignore
        [statsWindow, runtimeStats, runtimeStats, runtimeStats, runtimeStats, runtimeStats, runtimeStats, runtimeStats, runtimeStats,];
    }
}
if (runtimeStats.value && Object.keys(runtimeStats.value.httpErrors).length) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "channel-http-errors" },
    });
    /** @type {__VLS_StyleScopedClasses['channel-http-errors']} */ ;
    const __VLS_59 = __VLS_tryAsConstant((runtimeStats.value.httpErrors));
    for (const [count, statusCode] of __VLS_vFor(__VLS_nonNull(__VLS_59))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            key: (statusCode),
        });
        (statusCode);
        (count);
        // @ts-ignore
        [runtimeStats, runtimeStats, runtimeStats,];
    }
}
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "channel-toolbar" },
});
/** @type {__VLS_StyleScopedClasses['channel-toolbar']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
    ...{ class: "channel-search" },
});
/** @type {__VLS_StyleScopedClasses['channel-search']} */ ;
let __VLS_60;
/** @ts-ignore @type { | typeof __VLS_components.Search} */
Search;
// @ts-ignore
const __VLS_61 = __VLS_asFunctionalComponent1(__VLS_60, new __VLS_60({
    // @ts-ignore
    size: (16),
}));
const __VLS_62 = __VLS_61({
    size: (16),
}, ...__VLS_functionalComponentArgsRest(__VLS_61));
__VLS_asFunctionalElement1(__VLS_intrinsics.input)({
    placeholder: "搜索渠道、地址或模型",
});
(__VLS_unwrap(query, {}));
__VLS_asFunctionalElement1(__VLS_intrinsics.select, __VLS_intrinsics.select)({
    value: (__VLS_unwrap(status, {})),
    'aria-label': "渠道状态筛选",
});
__VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
    value: "all",
});
__VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
    value: "enabled",
});
__VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
    value: "disabled",
});
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (openCreate) },
    ...{ class: "channel-primary" },
    type: "button",
});
/** @type {__VLS_StyleScopedClasses['channel-primary']} */ ;
let __VLS_65;
/** @ts-ignore @type { | typeof __VLS_components.Plus} */
Plus;
// @ts-ignore
const __VLS_66 = __VLS_asFunctionalComponent1(__VLS_65, new __VLS_65({
    // @ts-ignore
    size: (16),
}));
const __VLS_67 = __VLS_66({
    size: (16),
}, ...__VLS_functionalComponentArgsRest(__VLS_66));
if (loading.value) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "channel-loading" },
    });
    /** @type {__VLS_StyleScopedClasses['channel-loading']} */ ;
    let __VLS_70;
    /** @ts-ignore @type { | typeof __VLS_components.LoaderCircle} */
    LoaderCircle;
    // @ts-ignore
    const __VLS_71 = __VLS_asFunctionalComponent1(__VLS_70, new __VLS_70({
        // @ts-ignore
        ...{ class: "spin" }, size: (22),
    }));
    const __VLS_72 = __VLS_71({
        ...{ class: "spin" },
        size: (22),
    }, ...__VLS_functionalComponentArgsRest(__VLS_71));
    /** @type {__VLS_StyleScopedClasses['spin']} */ ;
}
else if (filteredChannels.value.length) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "channel-table-wrap" },
    });
    /** @type {__VLS_StyleScopedClasses['channel-table-wrap']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.table, __VLS_intrinsics.table)({
        ...{ class: "channel-table" },
    });
    /** @type {__VLS_StyleScopedClasses['channel-table']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.thead, __VLS_intrinsics.thead)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.tbody, __VLS_intrinsics.tbody)({});
    const __VLS_75 = __VLS_tryAsConstant((filteredChannels.value));
    for (const [channel] of __VLS_vFor(__VLS_nonNull(__VLS_75))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
            key: (channel.id),
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: // @ts-ignore
                (...[$event]) => {
                    void $event;
                    if (!!(loading.value))
                        throw 0;
                    if (!(filteredChannels.value.length))
                        throw 0;
                    return (openEdit(channel));
                    // @ts-ignore
                    [query, status, loading, filteredChannels, filteredChannels,];
                } },
            ...{ class: "channel-name" },
            type: "button",
        });
        /** @type {__VLS_StyleScopedClasses['channel-name']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
        (channel.name);
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
        let __VLS_76;
        /** @ts-ignore @type { | typeof __VLS_components.KeyRound} */
        KeyRound;
        // @ts-ignore
        const __VLS_77 = __VLS_asFunctionalComponent1(__VLS_76, new __VLS_76({
            // @ts-ignore
            size: (12),
        }));
        const __VLS_78 = __VLS_77({
            size: (12),
        }, ...__VLS_functionalComponentArgsRest(__VLS_77));
        (channel.apiKeyMasked || "未保存密钥");
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
        (protocolLabels.value[channel.protocol] || channel.protocol);
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
        (channel.baseUrl);
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
        (channel.models.filter((model) => model.enabled).length);
        (channel.models.length);
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
        (channel.models.map((model) => `${capabilityLabel(model.capability)}·${model.displayName}`).join("、") || "尚未添加模型");
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "channel-status" },
            ...{ class: ({ 'is-enabled': channel.enabled && !channel.consecutiveFailures && !channel.cooldownUntil, 'is-error': channel.lastTestStatus === 'failed' || channel.consecutiveFailures > 0 }) },
        });
        /** @type {__VLS_StyleScopedClasses['channel-status']} */ ;
        /** @type {__VLS_StyleScopedClasses['is-enabled']} */ ;
        /** @type {__VLS_StyleScopedClasses['is-error']} */ ;
        (statusText(channel));
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "channel-test-result" },
        });
        /** @type {__VLS_StyleScopedClasses['channel-test-result']} */ ;
        if (channel.lastTestStatus === 'success') {
            let __VLS_81;
            /** @ts-ignore @type { | typeof __VLS_components.CheckCircle2} */
            CheckCircle2;
            // @ts-ignore
            const __VLS_82 = __VLS_asFunctionalComponent1(__VLS_81, new __VLS_81({
                // @ts-ignore
                size: (14),
            }));
            const __VLS_83 = __VLS_82({
                size: (14),
            }, ...__VLS_functionalComponentArgsRest(__VLS_82));
        }
        else if (channel.lastTestStatus === 'failed') {
            let __VLS_86;
            /** @ts-ignore @type { | typeof __VLS_components.XCircle} */
            XCircle;
            // @ts-ignore
            const __VLS_87 = __VLS_asFunctionalComponent1(__VLS_86, new __VLS_86({
                // @ts-ignore
                size: (14),
            }));
            const __VLS_88 = __VLS_87({
                size: (14),
            }, ...__VLS_functionalComponentArgsRest(__VLS_87));
        }
        else {
            let __VLS_91;
            /** @ts-ignore @type { | typeof __VLS_components.CircleAlert} */
            CircleAlert;
            // @ts-ignore
            const __VLS_92 = __VLS_asFunctionalComponent1(__VLS_91, new __VLS_91({
                // @ts-ignore
                size: (14),
            }));
            const __VLS_93 = __VLS_92({
                size: (14),
            }, ...__VLS_functionalComponentArgsRest(__VLS_92));
        }
        (channel.lastRuntimeAt ? `${channel.lastLatencyMs ?? '-'} ms · ${channel.lastRuntimeError || '运行正常'}` : channel.lastTestMessage || "尚未检测");
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "channel-actions" },
        });
        /** @type {__VLS_StyleScopedClasses['channel-actions']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: // @ts-ignore
                (...[$event]) => {
                    void $event;
                    if (!!(loading.value))
                        throw 0;
                    if (!(filteredChannels.value.length))
                        throw 0;
                    return (testChannel(channel));
                    // @ts-ignore
                    [protocolLabels,];
                } },
            type: "button",
            title: "测试连接",
        });
        if (testingId.value === channel.id) {
            let __VLS_96;
            /** @ts-ignore @type { | typeof __VLS_components.LoaderCircle} */
            LoaderCircle;
            // @ts-ignore
            const __VLS_97 = __VLS_asFunctionalComponent1(__VLS_96, new __VLS_96({
                // @ts-ignore
                ...{ class: "spin" }, size: (15),
            }));
            const __VLS_98 = __VLS_97({
                ...{ class: "spin" },
                size: (15),
            }, ...__VLS_functionalComponentArgsRest(__VLS_97));
            /** @type {__VLS_StyleScopedClasses['spin']} */ ;
        }
        else {
            let __VLS_101;
            /** @ts-ignore @type { | typeof __VLS_components.CheckCircle2} */
            CheckCircle2;
            // @ts-ignore
            const __VLS_102 = __VLS_asFunctionalComponent1(__VLS_101, new __VLS_101({
                // @ts-ignore
                size: (15),
            }));
            const __VLS_103 = __VLS_102({
                size: (15),
            }, ...__VLS_functionalComponentArgsRest(__VLS_102));
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: // @ts-ignore
                (...[$event]) => {
                    void $event;
                    if (!!(loading.value))
                        throw 0;
                    if (!(filteredChannels.value.length))
                        throw 0;
                    return (syncModels(channel));
                    // @ts-ignore
                    [testingId,];
                } },
            type: "button",
            title: "同步模型",
        });
        if (syncingId.value === channel.id) {
            let __VLS_106;
            /** @ts-ignore @type { | typeof __VLS_components.LoaderCircle} */
            LoaderCircle;
            // @ts-ignore
            const __VLS_107 = __VLS_asFunctionalComponent1(__VLS_106, new __VLS_106({
                // @ts-ignore
                ...{ class: "spin" }, size: (15),
            }));
            const __VLS_108 = __VLS_107({
                ...{ class: "spin" },
                size: (15),
            }, ...__VLS_functionalComponentArgsRest(__VLS_107));
            /** @type {__VLS_StyleScopedClasses['spin']} */ ;
        }
        else {
            let __VLS_111;
            /** @ts-ignore @type { | typeof __VLS_components.RefreshCw} */
            RefreshCw;
            // @ts-ignore
            const __VLS_112 = __VLS_asFunctionalComponent1(__VLS_111, new __VLS_111({
                // @ts-ignore
                size: (15),
            }));
            const __VLS_113 = __VLS_112({
                size: (15),
            }, ...__VLS_functionalComponentArgsRest(__VLS_112));
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: // @ts-ignore
                (...[$event]) => {
                    void $event;
                    if (!!(loading.value))
                        throw 0;
                    if (!(filteredChannels.value.length))
                        throw 0;
                    return (openEdit(channel));
                    // @ts-ignore
                    [syncingId,];
                } },
            type: "button",
            title: "编辑渠道",
        });
        let __VLS_116;
        /** @ts-ignore @type { | typeof __VLS_components.Pencil} */
        Pencil;
        // @ts-ignore
        const __VLS_117 = __VLS_asFunctionalComponent1(__VLS_116, new __VLS_116({
            // @ts-ignore
            size: (15),
        }));
        const __VLS_118 = __VLS_117({
            size: (15),
        }, ...__VLS_functionalComponentArgsRest(__VLS_117));
        let __VLS_121;
        /** @ts-ignore @type { | typeof __VLS_components.ElSwitch} */
        ElSwitch;
        // @ts-ignore
        const __VLS_122 = __VLS_asFunctionalComponent1(__VLS_121, new __VLS_121({
            // @ts-ignore
            ...{ 'onChange': {} }, modelValue: (channel.enabled),
        }));
        const __VLS_123 = __VLS_122({
            ...{ 'onChange': {} },
            modelValue: (channel.enabled),
        }, ...__VLS_functionalComponentArgsRest(__VLS_122));
        let __VLS_126;
        const __VLS_127 = {
            /** @type {typeof __VLS_126.change} */
            onChange: // @ts-ignore
            (...[$event]) => {
                void $event;
                if (!!(loading.value))
                    throw 0;
                if (!(filteredChannels.value.length))
                    throw 0;
                return (toggleChannel(channel, Boolean($event)));
                // @ts-ignore
                [];
            },
        };
        void __VLS_127;
        var __VLS_124;
        var __VLS_125;
        // @ts-ignore
        [];
    }
}
if (!loading.value && filteredChannels.value.length) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "channel-mobile-list" },
    });
    /** @type {__VLS_StyleScopedClasses['channel-mobile-list']} */ ;
    const __VLS_128 = __VLS_tryAsConstant((filteredChannels.value));
    for (const [channel] of __VLS_vFor(__VLS_nonNull(__VLS_128))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.article, __VLS_intrinsics.article)({
            key: (channel.id),
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "channel-mobile-head" },
        });
        /** @type {__VLS_StyleScopedClasses['channel-mobile-head']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: // @ts-ignore
                (...[$event]) => {
                    void $event;
                    if (!(!loading.value && filteredChannels.value.length))
                        throw 0;
                    return (openEdit(channel));
                    // @ts-ignore
                    [loading, filteredChannels, filteredChannels,];
                } },
            ...{ class: "channel-name" },
            type: "button",
        });
        /** @type {__VLS_StyleScopedClasses['channel-name']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
        (channel.name);
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
        let __VLS_129;
        /** @ts-ignore @type { | typeof __VLS_components.KeyRound} */
        KeyRound;
        // @ts-ignore
        const __VLS_130 = __VLS_asFunctionalComponent1(__VLS_129, new __VLS_129({
            // @ts-ignore
            size: (12),
        }));
        const __VLS_131 = __VLS_130({
            size: (12),
        }, ...__VLS_functionalComponentArgsRest(__VLS_130));
        (channel.apiKeyMasked || "未保存密钥");
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "channel-status" },
            ...{ class: ({ 'is-enabled': channel.enabled && !channel.consecutiveFailures && !channel.cooldownUntil, 'is-error': channel.lastTestStatus === 'failed' || channel.consecutiveFailures > 0 }) },
        });
        /** @type {__VLS_StyleScopedClasses['channel-status']} */ ;
        /** @type {__VLS_StyleScopedClasses['is-enabled']} */ ;
        /** @type {__VLS_StyleScopedClasses['is-error']} */ ;
        (statusText(channel));
        __VLS_asFunctionalElement1(__VLS_intrinsics.dl, __VLS_intrinsics.dl)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.dt, __VLS_intrinsics.dt)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.dd, __VLS_intrinsics.dd)({});
        (protocolLabels.value[channel.protocol] || channel.protocol);
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.dt, __VLS_intrinsics.dt)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.dd, __VLS_intrinsics.dd)({});
        (channel.models.filter((model) => model.enabled).length);
        (channel.models.length);
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({});
        (channel.models.map((model) => `${capabilityLabel(model.capability)}·${model.displayName}`).join("、") || "尚未添加模型");
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "channel-mobile-test" },
        });
        /** @type {__VLS_StyleScopedClasses['channel-mobile-test']} */ ;
        if (channel.lastTestStatus === 'success') {
            let __VLS_134;
            /** @ts-ignore @type { | typeof __VLS_components.CheckCircle2} */
            CheckCircle2;
            // @ts-ignore
            const __VLS_135 = __VLS_asFunctionalComponent1(__VLS_134, new __VLS_134({
                // @ts-ignore
                size: (14),
            }));
            const __VLS_136 = __VLS_135({
                size: (14),
            }, ...__VLS_functionalComponentArgsRest(__VLS_135));
        }
        else if (channel.lastTestStatus === 'failed') {
            let __VLS_139;
            /** @ts-ignore @type { | typeof __VLS_components.XCircle} */
            XCircle;
            // @ts-ignore
            const __VLS_140 = __VLS_asFunctionalComponent1(__VLS_139, new __VLS_139({
                // @ts-ignore
                size: (14),
            }));
            const __VLS_141 = __VLS_140({
                size: (14),
            }, ...__VLS_functionalComponentArgsRest(__VLS_140));
        }
        else {
            let __VLS_144;
            /** @ts-ignore @type { | typeof __VLS_components.CircleAlert} */
            CircleAlert;
            // @ts-ignore
            const __VLS_145 = __VLS_asFunctionalComponent1(__VLS_144, new __VLS_144({
                // @ts-ignore
                size: (14),
            }));
            const __VLS_146 = __VLS_145({
                size: (14),
            }, ...__VLS_functionalComponentArgsRest(__VLS_145));
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
        (channel.lastRuntimeAt ? `${channel.lastLatencyMs ?? '-'} ms · ${channel.lastRuntimeError || '运行正常'}` : channel.lastTestMessage || "尚未检测");
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "channel-mobile-actions" },
        });
        /** @type {__VLS_StyleScopedClasses['channel-mobile-actions']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: // @ts-ignore
                (...[$event]) => {
                    void $event;
                    if (!(!loading.value && filteredChannels.value.length))
                        throw 0;
                    return (testChannel(channel));
                    // @ts-ignore
                    [protocolLabels,];
                } },
            type: "button",
        });
        if (testingId.value === channel.id) {
            let __VLS_149;
            /** @ts-ignore @type { | typeof __VLS_components.LoaderCircle} */
            LoaderCircle;
            // @ts-ignore
            const __VLS_150 = __VLS_asFunctionalComponent1(__VLS_149, new __VLS_149({
                // @ts-ignore
                ...{ class: "spin" }, size: (15),
            }));
            const __VLS_151 = __VLS_150({
                ...{ class: "spin" },
                size: (15),
            }, ...__VLS_functionalComponentArgsRest(__VLS_150));
            /** @type {__VLS_StyleScopedClasses['spin']} */ ;
        }
        else {
            let __VLS_154;
            /** @ts-ignore @type { | typeof __VLS_components.CheckCircle2} */
            CheckCircle2;
            // @ts-ignore
            const __VLS_155 = __VLS_asFunctionalComponent1(__VLS_154, new __VLS_154({
                // @ts-ignore
                size: (15),
            }));
            const __VLS_156 = __VLS_155({
                size: (15),
            }, ...__VLS_functionalComponentArgsRest(__VLS_155));
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: // @ts-ignore
                (...[$event]) => {
                    void $event;
                    if (!(!loading.value && filteredChannels.value.length))
                        throw 0;
                    return (syncModels(channel));
                    // @ts-ignore
                    [testingId,];
                } },
            type: "button",
        });
        if (syncingId.value === channel.id) {
            let __VLS_159;
            /** @ts-ignore @type { | typeof __VLS_components.LoaderCircle} */
            LoaderCircle;
            // @ts-ignore
            const __VLS_160 = __VLS_asFunctionalComponent1(__VLS_159, new __VLS_159({
                // @ts-ignore
                ...{ class: "spin" }, size: (15),
            }));
            const __VLS_161 = __VLS_160({
                ...{ class: "spin" },
                size: (15),
            }, ...__VLS_functionalComponentArgsRest(__VLS_160));
            /** @type {__VLS_StyleScopedClasses['spin']} */ ;
        }
        else {
            let __VLS_164;
            /** @ts-ignore @type { | typeof __VLS_components.RefreshCw} */
            RefreshCw;
            // @ts-ignore
            const __VLS_165 = __VLS_asFunctionalComponent1(__VLS_164, new __VLS_164({
                // @ts-ignore
                size: (15),
            }));
            const __VLS_166 = __VLS_165({
                size: (15),
            }, ...__VLS_functionalComponentArgsRest(__VLS_165));
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: // @ts-ignore
                (...[$event]) => {
                    void $event;
                    if (!(!loading.value && filteredChannels.value.length))
                        throw 0;
                    return (openEdit(channel));
                    // @ts-ignore
                    [syncingId,];
                } },
            type: "button",
        });
        let __VLS_169;
        /** @ts-ignore @type { | typeof __VLS_components.Pencil} */
        Pencil;
        // @ts-ignore
        const __VLS_170 = __VLS_asFunctionalComponent1(__VLS_169, new __VLS_169({
            // @ts-ignore
            size: (15),
        }));
        const __VLS_171 = __VLS_170({
            size: (15),
        }, ...__VLS_functionalComponentArgsRest(__VLS_170));
        let __VLS_174;
        /** @ts-ignore @type { | typeof __VLS_components.ElSwitch} */
        ElSwitch;
        // @ts-ignore
        const __VLS_175 = __VLS_asFunctionalComponent1(__VLS_174, new __VLS_174({
            // @ts-ignore
            ...{ 'onChange': {} }, modelValue: (channel.enabled),
        }));
        const __VLS_176 = __VLS_175({
            ...{ 'onChange': {} },
            modelValue: (channel.enabled),
        }, ...__VLS_functionalComponentArgsRest(__VLS_175));
        let __VLS_179;
        const __VLS_180 = {
            /** @type {typeof __VLS_179.change} */
            onChange: // @ts-ignore
            (...[$event]) => {
                void $event;
                if (!(!loading.value && filteredChannels.value.length))
                    throw 0;
                return (toggleChannel(channel, Boolean($event)));
                // @ts-ignore
                [];
            },
        };
        void __VLS_180;
        var __VLS_177;
        var __VLS_178;
        // @ts-ignore
        [];
    }
}
if (!loading.value && !filteredChannels.value.length) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "channel-empty" },
    });
    /** @type {__VLS_StyleScopedClasses['channel-empty']} */ ;
    let __VLS_181;
    /** @ts-ignore @type { | typeof __VLS_components.KeyRound} */
    KeyRound;
    // @ts-ignore
    const __VLS_182 = __VLS_asFunctionalComponent1(__VLS_181, new __VLS_181({
        // @ts-ignore
        size: (28),
    }));
    const __VLS_183 = __VLS_182({
        size: (28),
    }, ...__VLS_functionalComponentArgsRest(__VLS_182));
    __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
    (channels.value.length ? "没有匹配的渠道" : "还没有模型渠道");
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    if (!channels.value.length) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (openCreate) },
            ...{ class: "channel-primary" },
            type: "button",
        });
        /** @type {__VLS_StyleScopedClasses['channel-primary']} */ ;
        let __VLS_186;
        /** @ts-ignore @type { | typeof __VLS_components.Plus} */
        Plus;
        // @ts-ignore
        const __VLS_187 = __VLS_asFunctionalComponent1(__VLS_186, new __VLS_186({
            // @ts-ignore
            size: (16),
        }));
        const __VLS_188 = __VLS_187({
            size: (16),
        }, ...__VLS_functionalComponentArgsRest(__VLS_187));
    }
}
let __VLS_191;
/** @ts-ignore @type { | typeof __VLS_components.ElDialog | typeof __VLS_components.ElDialog} */
ElDialog;
// @ts-ignore
const __VLS_192 = __VLS_asFunctionalComponent1(__VLS_191, new __VLS_191({
    // @ts-ignore
    modelValue: (dialogOpen.value), title: (editingId.value ? '编辑模型渠道' : onboardingStep.value === 0 ? '选择渠道协议' : '接入模型渠道'), width: "min(760px, calc(100vw - 28px))", destroyOnClose: true,
}));
const __VLS_193 = __VLS_192({
    modelValue: (dialogOpen.value),
    title: (editingId.value ? '编辑模型渠道' : onboardingStep.value === 0 ? '选择渠道协议' : '接入模型渠道'),
    width: "min(760px, calc(100vw - 28px))",
    destroyOnClose: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_192));
const { default: __VLS_196 } = __VLS_nonNull(__VLS_194.slots);
if (onboardingStep.value === 0) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "protocol-grid" },
    });
    /** @type {__VLS_StyleScopedClasses['protocol-grid']} */ ;
    const __VLS_197 = __VLS_tryAsConstant((__VLS_unwrap(protocols, {})));
    for (const [protocol] of __VLS_vFor(__VLS_nonNull(__VLS_197))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: // @ts-ignore
                (...[$event]) => {
                    void $event;
                    if (!(onboardingStep.value === 0))
                        throw 0;
                    return (chooseProtocol(protocol));
                    // @ts-ignore
                    [channels, channels, loading, filteredChannels, dialogOpen, editingId, onboardingStep, onboardingStep, protocols,];
                } },
            key: (protocol.id),
            type: "button",
            ...{ class: ({ 'is-selected': channelForm.value.protocol === protocol.id }) },
        });
        /** @type {__VLS_StyleScopedClasses['is-selected']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
        (protocol.label);
        if (channelForm.value.protocol === protocol.id) {
            let __VLS_198;
            /** @ts-ignore @type { | typeof __VLS_components.Check} */
            Check;
            // @ts-ignore
            const __VLS_199 = __VLS_asFunctionalComponent1(__VLS_198, new __VLS_198({
                // @ts-ignore
                size: (16),
            }));
            const __VLS_200 = __VLS_199({
                size: (16),
            }, ...__VLS_functionalComponentArgsRest(__VLS_199));
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({});
        (protocol.description);
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "protocol-capabilities" },
        });
        /** @type {__VLS_StyleScopedClasses['protocol-capabilities']} */ ;
        const __VLS_203 = __VLS_tryAsConstant((protocol.capabilities));
        for (const [capability] of __VLS_vFor(__VLS_nonNull(__VLS_203))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.em, __VLS_intrinsics.em)({
                key: (capability),
            });
            (capabilityLabel(capability));
            // @ts-ignore
            [channelForm, channelForm,];
        }
        // @ts-ignore
        [];
    }
}
else {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "channel-form-grid" },
    });
    /** @type {__VLS_StyleScopedClasses['channel-form-grid']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    let __VLS_204;
    /** @ts-ignore @type { | typeof __VLS_components.ElInput} */
    ElInput;
    // @ts-ignore
    const __VLS_205 = __VLS_asFunctionalComponent1(__VLS_204, new __VLS_204({
        // @ts-ignore
        modelValue: (channelForm.value.name), placeholder: "例如：生产主渠道",
    }));
    const __VLS_206 = __VLS_205({
        modelValue: (channelForm.value.name),
        placeholder: "例如：生产主渠道",
    }, ...__VLS_functionalComponentArgsRest(__VLS_205));
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    let __VLS_209;
    /** @ts-ignore @type { | typeof __VLS_components.ElSelect | typeof __VLS_components.ElSelect} */
    ElSelect;
    // @ts-ignore
    const __VLS_210 = __VLS_asFunctionalComponent1(__VLS_209, new __VLS_209({
        // @ts-ignore
        modelValue: (channelForm.value.protocol), disabled: true,
    }));
    const __VLS_211 = __VLS_210({
        modelValue: (channelForm.value.protocol),
        disabled: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_210));
    const { default: __VLS_214 } = __VLS_nonNull(__VLS_212.slots);
    let __VLS_215;
    /** @ts-ignore @type { | typeof __VLS_components.ElOption} */
    ElOption;
    // @ts-ignore
    const __VLS_216 = __VLS_asFunctionalComponent1(__VLS_215, new __VLS_215({
        // @ts-ignore
        label: (selectedProtocol.value?.label || channelForm.value.protocol), value: (channelForm.value.protocol),
    }));
    const __VLS_217 = __VLS_216({
        label: (selectedProtocol.value?.label || channelForm.value.protocol),
        value: (channelForm.value.protocol),
    }, ...__VLS_functionalComponentArgsRest(__VLS_216));
    // @ts-ignore
    [channelForm, channelForm, channelForm, channelForm, selectedProtocol,];
    var __VLS_212;
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
        ...{ class: "channel-form-wide" },
    });
    /** @type {__VLS_StyleScopedClasses['channel-form-wide']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    let __VLS_220;
    /** @ts-ignore @type { | typeof __VLS_components.ElInput} */
    ElInput;
    // @ts-ignore
    const __VLS_221 = __VLS_asFunctionalComponent1(__VLS_220, new __VLS_220({
        // @ts-ignore
        modelValue: (channelForm.value.baseUrl), placeholder: "https:/*api.example.com/v1", *() { }
    } / ));
}
;
const __VLS_222 = __VLS_221({
    modelValue: (channelForm.value.baseUrl),
    placeholder: "https://api.example.com/v1",
}, ...__VLS_functionalComponentArgsRest(__VLS_221));
__VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
    ...{ class: "channel-form-wide" },
});
/** @type {__VLS_StyleScopedClasses['channel-form-wide']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
let __VLS_225;
/** @ts-ignore @type { | typeof __VLS_components.ElInput} */
ElInput;
// @ts-ignore
const __VLS_226 = __VLS_asFunctionalComponent1(__VLS_225, new __VLS_225({
    // @ts-ignore
    modelValue: (channelForm.value.apiKey), type: "password", showPassword: true, placeholder: (editingChannel.value?.hasApiKey ? `已保存 ${editingChannel.value.apiKeyMasked}，留空保持不变` : '输入 API Key'),
}));
const __VLS_227 = __VLS_226({
    modelValue: (channelForm.value.apiKey),
    type: "password",
    showPassword: true,
    placeholder: (editingChannel.value?.hasApiKey ? `已保存 ${editingChannel.value.apiKeyMasked}，留空保持不变` : '输入 API Key'),
}, ...__VLS_functionalComponentArgsRest(__VLS_226));
__VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
    ...{ class: "channel-switch-row" },
});
/** @type {__VLS_StyleScopedClasses['channel-switch-row']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.small, __VLS_intrinsics.small)({});
let __VLS_230;
/** @ts-ignore @type { | typeof __VLS_components.ElSwitch} */
ElSwitch;
// @ts-ignore
const __VLS_231 = __VLS_asFunctionalComponent1(__VLS_230, new __VLS_230({
    // @ts-ignore
    modelValue: (channelForm.value.enabled),
}));
const __VLS_232 = __VLS_231({
    modelValue: (channelForm.value.enabled),
}, ...__VLS_functionalComponentArgsRest(__VLS_231));
__VLS_asFunctionalElement1(__VLS_intrinsics.details, __VLS_intrinsics.details)({
    ...{ class: "channel-advanced channel-form-wide" },
});
/** @type {__VLS_StyleScopedClasses['channel-advanced']} */ ;
/** @type {__VLS_StyleScopedClasses['channel-form-wide']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.summary, __VLS_intrinsics.summary)({});
let __VLS_235;
/** @ts-ignore @type { | typeof __VLS_components.Settings2} */
Settings2;
// @ts-ignore
const __VLS_236 = __VLS_asFunctionalComponent1(__VLS_235, new __VLS_235({
    // @ts-ignore
    size: (15),
}));
const __VLS_237 = __VLS_236({
    size: (15),
}, ...__VLS_functionalComponentArgsRest(__VLS_236));
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "channel-advanced-grid" },
});
/** @type {__VLS_StyleScopedClasses['channel-advanced-grid']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
let __VLS_240;
/** @ts-ignore @type { | typeof __VLS_components.ElInputNumber} */
ElInputNumber;
// @ts-ignore
const __VLS_241 = __VLS_asFunctionalComponent1(__VLS_240, new __VLS_240({
    // @ts-ignore
    modelValue: (channelForm.value.priority), min: (1), max: (10000),
}));
const __VLS_242 = __VLS_241({
    modelValue: (channelForm.value.priority),
    min: (1),
    max: (10000),
}, ...__VLS_functionalComponentArgsRest(__VLS_241));
__VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
let __VLS_245;
/** @ts-ignore @type { | typeof __VLS_components.ElInputNumber} */
ElInputNumber;
// @ts-ignore
const __VLS_246 = __VLS_asFunctionalComponent1(__VLS_245, new __VLS_245({
    // @ts-ignore
    modelValue: (channelForm.value.weight), min: (1), max: (10000),
}));
const __VLS_247 = __VLS_246({
    modelValue: (channelForm.value.weight),
    min: (1),
    max: (10000),
}, ...__VLS_functionalComponentArgsRest(__VLS_246));
__VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
let __VLS_250;
/** @ts-ignore @type { | typeof __VLS_components.ElInputNumber} */
ElInputNumber;
// @ts-ignore
const __VLS_251 = __VLS_asFunctionalComponent1(__VLS_250, new __VLS_250({
    // @ts-ignore
    modelValue: (channelForm.value.maxConcurrency), min: (1), max: (1000),
}));
const __VLS_252 = __VLS_251({
    modelValue: (channelForm.value.maxConcurrency),
    min: (1),
    max: (1000),
}, ...__VLS_functionalComponentArgsRest(__VLS_251));
__VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
let __VLS_255;
/** @ts-ignore @type { | typeof __VLS_components.ElInputNumber} */
ElInputNumber;
// @ts-ignore
const __VLS_256 = __VLS_asFunctionalComponent1(__VLS_255, new __VLS_255({
    // @ts-ignore
    modelValue: (channelForm.value.timeoutSeconds), min: (1), max: (3600),
}));
const __VLS_257 = __VLS_256({
    modelValue: (channelForm.value.timeoutSeconds),
    min: (1),
    max: (3600),
}, ...__VLS_functionalComponentArgsRest(__VLS_256));
__VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
let __VLS_260;
/** @ts-ignore @type { | typeof __VLS_components.ElInputNumber} */
ElInputNumber;
// @ts-ignore
const __VLS_261 = __VLS_asFunctionalComponent1(__VLS_260, new __VLS_260({
    // @ts-ignore
    modelValue: (channelForm.value.failureThreshold), min: (1), max: (100),
}));
const __VLS_262 = __VLS_261({
    modelValue: (channelForm.value.failureThreshold),
    min: (1),
    max: (100),
}, ...__VLS_functionalComponentArgsRest(__VLS_261));
__VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
let __VLS_265;
/** @ts-ignore @type { | typeof __VLS_components.ElInputNumber} */
ElInputNumber;
// @ts-ignore
const __VLS_266 = __VLS_asFunctionalComponent1(__VLS_265, new __VLS_265({
    // @ts-ignore
    modelValue: (channelForm.value.cooldownSeconds), min: (1), max: (86400),
}));
const __VLS_267 = __VLS_266({
    modelValue: (channelForm.value.cooldownSeconds),
    min: (1),
    max: (86400),
}, ...__VLS_functionalComponentArgsRest(__VLS_266));
__VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
let __VLS_270;
/** @ts-ignore @type { | typeof __VLS_components.ElSelect | typeof __VLS_components.ElSelect} */
ElSelect;
// @ts-ignore
const __VLS_271 = __VLS_asFunctionalComponent1(__VLS_270, new __VLS_270({
    // @ts-ignore
    modelValue: (channelForm.value.advancedConfig.apiFormat), disabled: (selectedProtocol.value?.strict),
}));
const __VLS_272 = __VLS_271({
    modelValue: (channelForm.value.advancedConfig.apiFormat),
    disabled: (selectedProtocol.value?.strict),
}, ...__VLS_functionalComponentArgsRest(__VLS_271));
const { default: __VLS_275 } = __VLS_nonNull(__VLS_273.slots);
let __VLS_276;
/** @ts-ignore @type { | typeof __VLS_components.ElOption} */
ElOption;
// @ts-ignore
const __VLS_277 = __VLS_asFunctionalComponent1(__VLS_276, new __VLS_276({
    // @ts-ignore
    label: "OpenAI", value: "openai",
}));
const __VLS_278 = __VLS_277({
    label: "OpenAI",
    value: "openai",
}, ...__VLS_functionalComponentArgsRest(__VLS_277));
let __VLS_281;
/** @ts-ignore @type { | typeof __VLS_components.ElOption} */
ElOption;
// @ts-ignore
const __VLS_282 = __VLS_asFunctionalComponent1(__VLS_281, new __VLS_281({
    // @ts-ignore
    label: "Gemini", value: "gemini",
}));
const __VLS_283 = __VLS_282({
    label: "Gemini",
    value: "gemini",
}, ...__VLS_functionalComponentArgsRest(__VLS_282));
// @ts-ignore
[channelForm, channelForm, channelForm, channelForm, channelForm, channelForm, channelForm, channelForm, channelForm, channelForm, selectedProtocol, editingChannel, editingChannel,];
var __VLS_273;
__VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
let __VLS_286;
/** @ts-ignore @type { | typeof __VLS_components.ElSelect | typeof __VLS_components.ElSelect} */
ElSelect;
// @ts-ignore
const __VLS_287 = __VLS_asFunctionalComponent1(__VLS_286, new __VLS_286({
    // @ts-ignore
    modelValue: (channelForm.value.advancedConfig.authMode), disabled: (selectedProtocol.value?.strict),
}));
const __VLS_288 = __VLS_287({
    modelValue: (channelForm.value.advancedConfig.authMode),
    disabled: (selectedProtocol.value?.strict),
}, ...__VLS_functionalComponentArgsRest(__VLS_287));
const { default: __VLS_291 } = __VLS_nonNull(__VLS_289.slots);
let __VLS_292;
/** @ts-ignore @type { | typeof __VLS_components.ElOption} */
ElOption;
// @ts-ignore
const __VLS_293 = __VLS_asFunctionalComponent1(__VLS_292, new __VLS_292({
    // @ts-ignore
    label: "Bearer Token", value: "bearer",
}));
const __VLS_294 = __VLS_293({
    label: "Bearer Token",
    value: "bearer",
}, ...__VLS_functionalComponentArgsRest(__VLS_293));
let __VLS_297;
/** @ts-ignore @type { | typeof __VLS_components.ElOption} */
ElOption;
// @ts-ignore
const __VLS_298 = __VLS_asFunctionalComponent1(__VLS_297, new __VLS_297({
    // @ts-ignore
    label: "x-api-key", value: "x-api-key",
}));
const __VLS_299 = __VLS_298({
    label: "x-api-key",
    value: "x-api-key",
}, ...__VLS_functionalComponentArgsRest(__VLS_298));
let __VLS_302;
/** @ts-ignore @type { | typeof __VLS_components.ElOption} */
ElOption;
// @ts-ignore
const __VLS_303 = __VLS_asFunctionalComponent1(__VLS_302, new __VLS_302({
    // @ts-ignore
    label: "自定义 Header", value: "custom-header",
}));
const __VLS_304 = __VLS_303({
    label: "自定义 Header",
    value: "custom-header",
}, ...__VLS_functionalComponentArgsRest(__VLS_303));
let __VLS_307;
/** @ts-ignore @type { | typeof __VLS_components.ElOption} */
ElOption;
// @ts-ignore
const __VLS_308 = __VLS_asFunctionalComponent1(__VLS_307, new __VLS_307({
    // @ts-ignore
    label: "无需鉴权", value: "none",
}));
const __VLS_309 = __VLS_308({
    label: "无需鉴权",
    value: "none",
}, ...__VLS_functionalComponentArgsRest(__VLS_308));
// @ts-ignore
[channelForm, selectedProtocol,];
var __VLS_289;
if (channelForm.value.advancedConfig.authMode === 'custom-header') {
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    let __VLS_312;
    /** @ts-ignore @type { | typeof __VLS_components.ElInput} */
    ElInput;
    // @ts-ignore
    const __VLS_313 = __VLS_asFunctionalComponent1(__VLS_312, new __VLS_312({
        // @ts-ignore
        modelValue: (channelForm.value.advancedConfig.authHeader), placeholder: "x-api-key",
    }));
    const __VLS_314 = __VLS_313({
        modelValue: (channelForm.value.advancedConfig.authHeader),
        placeholder: "x-api-key",
    }, ...__VLS_functionalComponentArgsRest(__VLS_313));
}
if (channelForm.value.advancedConfig.authMode === 'custom-header') {
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    let __VLS_317;
    /** @ts-ignore @type { | typeof __VLS_components.ElInput} */
    ElInput;
    // @ts-ignore
    const __VLS_318 = __VLS_asFunctionalComponent1(__VLS_317, new __VLS_317({
        // @ts-ignore
        modelValue: (channelForm.value.advancedConfig.authPrefix), placeholder: "可留空",
    }));
    const __VLS_319 = __VLS_318({
        modelValue: (channelForm.value.advancedConfig.authPrefix),
        placeholder: "可留空",
    }, ...__VLS_functionalComponentArgsRest(__VLS_318));
}
__VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
    ...{ class: "channel-form-wide" },
});
/** @type {__VLS_StyleScopedClasses['channel-form-wide']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
let __VLS_322;
/** @ts-ignore @type { | typeof __VLS_components.ElInput} */
ElInput;
// @ts-ignore
const __VLS_323 = __VLS_asFunctionalComponent1(__VLS_322, new __VLS_322({
    // @ts-ignore
    ...{ 'onUpdate:modelValue': {} }, modelValue: (channelForm.value.advancedConfig.modelCatalogPaths.join(', ')), disabled: (selectedProtocol.value?.strict), placeholder: "/v1/models",
}));
const __VLS_324 = __VLS_323({
    ...{ 'onUpdate:modelValue': {} },
    modelValue: (channelForm.value.advancedConfig.modelCatalogPaths.join(', ')),
    disabled: (selectedProtocol.value?.strict),
    placeholder: "/v1/models",
}, ...__VLS_functionalComponentArgsRest(__VLS_323));
let __VLS_327;
const __VLS_328 = {
    /** @type {typeof __VLS_327.'update:modelValue'} */
    'onUpdate:modelValue': // @ts-ignore
    (...[$event]) => {
        void $event;
        if (!!(onboardingStep.value === 0))
            throw 0;
        return (channelForm.value.advancedConfig.modelCatalogPaths = String($event).split(',').map((item) => item.trim()).filter(Boolean));
        // @ts-ignore
        [channelForm, channelForm, channelForm, channelForm, channelForm, channelForm, selectedProtocol,];
    },
};
void __VLS_328;
var __VLS_325;
var __VLS_326;
if (selectedProtocol.value?.strict) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "channel-protocol-operations channel-form-wide" },
    });
    /** @type {__VLS_StyleScopedClasses['channel-protocol-operations']} */ ;
    /** @type {__VLS_StyleScopedClasses['channel-form-wide']} */ ;
    const __VLS_329 = __VLS_tryAsConstant((selectedProtocol.value.capabilities));
    for (const [capability] of __VLS_vFor(__VLS_nonNull(__VLS_329))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
            key: (capability),
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
        (capabilityLabel(capability));
        __VLS_asFunctionalElement1(__VLS_intrinsics.dl, __VLS_intrinsics.dl)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.dt, __VLS_intrinsics.dt)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.dd, __VLS_intrinsics.dd)({});
        (channelForm.value.advancedConfig.operationConfigs?.[capability]?.createPath || "未配置");
        if (channelForm.value.advancedConfig.operationConfigs?.[capability]?.editPath) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.dt, __VLS_intrinsics.dt)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.dd, __VLS_intrinsics.dd)({});
            (channelForm.value.advancedConfig.operationConfigs?.[capability]?.editPath);
        }
        if (channelForm.value.advancedConfig.operationConfigs?.[capability]?.imageToVideoPath) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.dt, __VLS_intrinsics.dt)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.dd, __VLS_intrinsics.dd)({});
            (channelForm.value.advancedConfig.operationConfigs?.[capability]?.imageToVideoPath);
        }
        if (channelForm.value.advancedConfig.operationConfigs?.[capability]?.queryPath) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.dt, __VLS_intrinsics.dt)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.dd, __VLS_intrinsics.dd)({});
            (channelForm.value.advancedConfig.operationConfigs?.[capability]?.queryPath);
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.dt, __VLS_intrinsics.dt)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.dd, __VLS_intrinsics.dd)({});
        (channelForm.value.advancedConfig.operationConfigs?.[capability]?.resultField || "未配置");
        // @ts-ignore
        [channelForm, channelForm, channelForm, channelForm, channelForm, channelForm, channelForm, channelForm, selectedProtocol, selectedProtocol,];
    }
}
else {
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    let __VLS_330;
    /** @ts-ignore @type { | typeof __VLS_components.ElInput} */
    ElInput;
    // @ts-ignore
    const __VLS_331 = __VLS_asFunctionalComponent1(__VLS_330, new __VLS_330({
        // @ts-ignore
        modelValue: (channelForm.value.advancedConfig.createPath), placeholder: "/images/generations",
    }));
    const __VLS_332 = __VLS_331({
        modelValue: (channelForm.value.advancedConfig.createPath),
        placeholder: "/images/generations",
    }, ...__VLS_functionalComponentArgsRest(__VLS_331));
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    let __VLS_335;
    /** @ts-ignore @type { | typeof __VLS_components.ElInput} */
    ElInput;
    // @ts-ignore
    const __VLS_336 = __VLS_asFunctionalComponent1(__VLS_335, new __VLS_335({
        // @ts-ignore
        modelValue: (channelForm.value.advancedConfig.queryPath), placeholder: "/tasks/:task_id",
    }));
    const __VLS_337 = __VLS_336({
        modelValue: (channelForm.value.advancedConfig.queryPath),
        placeholder: "/tasks/:task_id",
    }, ...__VLS_functionalComponentArgsRest(__VLS_336));
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    let __VLS_340;
    /** @ts-ignore @type { | typeof __VLS_components.ElInput} */
    ElInput;
    // @ts-ignore
    const __VLS_341 = __VLS_asFunctionalComponent1(__VLS_340, new __VLS_340({
        // @ts-ignore
        modelValue: (channelForm.value.advancedConfig.cancelPath), placeholder: "/tasks/:task_id/cancel",
    }));
    const __VLS_342 = __VLS_341({
        modelValue: (channelForm.value.advancedConfig.cancelPath),
        placeholder: "/tasks/:task_id/cancel",
    }, ...__VLS_functionalComponentArgsRest(__VLS_341));
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    let __VLS_345;
    /** @ts-ignore @type { | typeof __VLS_components.ElSelect | typeof __VLS_components.ElSelect} */
    ElSelect;
    // @ts-ignore
    const __VLS_346 = __VLS_asFunctionalComponent1(__VLS_345, new __VLS_345({
        // @ts-ignore
        modelValue: (channelForm.value.advancedConfig.cancelMethod),
    }));
    const __VLS_347 = __VLS_346({
        modelValue: (channelForm.value.advancedConfig.cancelMethod),
    }, ...__VLS_functionalComponentArgsRest(__VLS_346));
    const { default: __VLS_350 } = __VLS_nonNull(__VLS_348.slots);
    let __VLS_351;
    /** @ts-ignore @type { | typeof __VLS_components.ElOption} */
    ElOption;
    // @ts-ignore
    const __VLS_352 = __VLS_asFunctionalComponent1(__VLS_351, new __VLS_351({
        // @ts-ignore
        label: "POST", value: "POST",
    }));
    const __VLS_353 = __VLS_352({
        label: "POST",
        value: "POST",
    }, ...__VLS_functionalComponentArgsRest(__VLS_352));
    let __VLS_356;
    /** @ts-ignore @type { | typeof __VLS_components.ElOption} */
    ElOption;
    // @ts-ignore
    const __VLS_357 = __VLS_asFunctionalComponent1(__VLS_356, new __VLS_356({
        // @ts-ignore
        label: "DELETE", value: "DELETE",
    }));
    const __VLS_358 = __VLS_357({
        label: "DELETE",
        value: "DELETE",
    }, ...__VLS_functionalComponentArgsRest(__VLS_357));
    // @ts-ignore
    [channelForm, channelForm, channelForm, channelForm,];
    var __VLS_348;
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
        ...{ class: "channel-form-wide" },
    });
    /** @type {__VLS_StyleScopedClasses['channel-form-wide']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    let __VLS_361;
    /** @ts-ignore @type { | typeof __VLS_components.ElInput} */
    ElInput;
    // @ts-ignore
    const __VLS_362 = __VLS_asFunctionalComponent1(__VLS_361, new __VLS_361({
        // @ts-ignore
        modelValue: (channelForm.value.advancedConfig.requestTemplate), type: "textarea", rows: (3), placeholder: '{"model":"{{model}}","prompt":"{{prompt}}"}',
    }));
    const __VLS_363 = __VLS_362({
        modelValue: (channelForm.value.advancedConfig.requestTemplate),
        type: "textarea",
        rows: (3),
        placeholder: '{"model":"{{model}}","prompt":"{{prompt}}"}',
    }, ...__VLS_functionalComponentArgsRest(__VLS_362));
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    let __VLS_366;
    /** @ts-ignore @type { | typeof __VLS_components.ElInput} */
    ElInput;
    // @ts-ignore
    const __VLS_367 = __VLS_asFunctionalComponent1(__VLS_366, new __VLS_366({
        // @ts-ignore
        modelValue: (channelForm.value.advancedConfig.resultField), placeholder: "data[0].url",
    }));
    const __VLS_368 = __VLS_367({
        modelValue: (channelForm.value.advancedConfig.resultField),
        placeholder: "data[0].url",
    }, ...__VLS_functionalComponentArgsRest(__VLS_367));
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    let __VLS_371;
    /** @ts-ignore @type { | typeof __VLS_components.ElInput} */
    ElInput;
    // @ts-ignore
    const __VLS_372 = __VLS_asFunctionalComponent1(__VLS_371, new __VLS_371({
        // @ts-ignore
        modelValue: (channelForm.value.advancedConfig.statusField), placeholder: "status",
    }));
    const __VLS_373 = __VLS_372({
        modelValue: (channelForm.value.advancedConfig.statusField),
        placeholder: "status",
    }, ...__VLS_functionalComponentArgsRest(__VLS_372));
}
__VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
    ...{ class: "channel-form-wide" },
});
/** @type {__VLS_StyleScopedClasses['channel-form-wide']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
let __VLS_376;
/** @ts-ignore @type { | typeof __VLS_components.ElInput} */
ElInput;
// @ts-ignore
const __VLS_377 = __VLS_asFunctionalComponent1(__VLS_376, new __VLS_376({
    // @ts-ignore
    modelValue: (channelForm.value.advancedConfig.documentationUrl), placeholder: "https:/*docs.example.com/api", *() { }
} / ));
;
const __VLS_378 = __VLS_377({
    modelValue: (channelForm.value.advancedConfig.documentationUrl),
    placeholder: "https://docs.example.com/api",
}, ...__VLS_functionalComponentArgsRest(__VLS_377));
if (onboardingStep.value === 1 && editingChannel.value) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "channel-models-section" },
    });
    /** @type {__VLS_StyleScopedClasses['channel-models-section']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "channel-models-heading" },
    });
    /** @type {__VLS_StyleScopedClasses['channel-models-heading']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
    let __VLS_381;
    /** @ts-ignore @type { | typeof __VLS_components.ElButton | typeof __VLS_components.ElButton} */
    ElButton;
    // @ts-ignore
    const __VLS_382 = __VLS_asFunctionalComponent1(__VLS_381, new __VLS_381({
        // @ts-ignore
        ...{ 'onClick': {} }, loading: (syncingId.value === editingChannel.value.id),
    }));
    const __VLS_383 = __VLS_382({
        ...{ 'onClick': {} },
        loading: (syncingId.value === editingChannel.value.id),
    }, ...__VLS_functionalComponentArgsRest(__VLS_382));
    let __VLS_386;
    const __VLS_387 = {
        /** @type {typeof __VLS_386.click} */
        onClick: // @ts-ignore
        (...[$event]) => {
            void $event;
            if (!(onboardingStep.value === 1 && editingChannel.value))
                throw 0;
            return (syncModels(editingChannel.value));
            // @ts-ignore
            [syncingId, onboardingStep, channelForm, channelForm, channelForm, channelForm, editingChannel, editingChannel, editingChannel,];
        },
    };
    void __VLS_387;
    const { default: __VLS_388 } = __VLS_nonNull(__VLS_384.slots);
    let __VLS_389;
    /** @ts-ignore @type { | typeof __VLS_components.RefreshCw} */
    RefreshCw;
    // @ts-ignore
    const __VLS_390 = __VLS_asFunctionalComponent1(__VLS_389, new __VLS_389({
        // @ts-ignore
        size: (14),
    }));
    const __VLS_391 = __VLS_390({
        size: (14),
    }, ...__VLS_functionalComponentArgsRest(__VLS_390));
    // @ts-ignore
    [];
    var __VLS_384;
    var __VLS_385;
    let __VLS_394;
    /** @ts-ignore @type { | typeof __VLS_components.ElButton | typeof __VLS_components.ElButton} */
    ElButton;
    // @ts-ignore
    const __VLS_395 = __VLS_asFunctionalComponent1(__VLS_394, new __VLS_394({
        // @ts-ignore
        ...{ 'onClick': {} }, type: "primary",
    }));
    const __VLS_396 = __VLS_395({
        ...{ 'onClick': {} },
        type: "primary",
    }, ...__VLS_functionalComponentArgsRest(__VLS_395));
    let __VLS_399;
    const __VLS_400 = {
        /** @type {typeof __VLS_399.click} */
        onClick: // @ts-ignore
        (...[$event]) => {
            void $event;
            if (!(onboardingStep.value === 1 && editingChannel.value))
                throw 0;
            return (openModel());
            // @ts-ignore
            [];
        },
    };
    void __VLS_400;
    const { default: __VLS_401 } = __VLS_nonNull(__VLS_397.slots);
    let __VLS_402;
    /** @ts-ignore @type { | typeof __VLS_components.Plus} */
    Plus;
    // @ts-ignore
    const __VLS_403 = __VLS_asFunctionalComponent1(__VLS_402, new __VLS_402({
        // @ts-ignore
        size: (14),
    }));
    const __VLS_404 = __VLS_403({
        size: (14),
    }, ...__VLS_functionalComponentArgsRest(__VLS_403));
    // @ts-ignore
    [];
    var __VLS_397;
    var __VLS_398;
    if (editingChannel.value.models.length) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "channel-model-list" },
        });
        /** @type {__VLS_StyleScopedClasses['channel-model-list']} */ ;
        const __VLS_407 = __VLS_tryAsConstant((editingChannel.value.models));
        for (const [model] of __VLS_vFor(__VLS_nonNull(__VLS_407))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                key: (model.id),
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
            (model.displayName);
            __VLS_asFunctionalElement1(__VLS_intrinsics.small, __VLS_intrinsics.small)({});
            (capabilityLabel(model.capability));
            (model.modelId);
            (model.sortOrder);
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "channel-model-ops" },
            });
            /** @type {__VLS_StyleScopedClasses['channel-model-ops']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "channel-status" },
                ...{ class: ({ 'is-enabled': model.enabled }) },
            });
            /** @type {__VLS_StyleScopedClasses['channel-status']} */ ;
            /** @type {__VLS_StyleScopedClasses['is-enabled']} */ ;
            (model.enabled ? "已启用" : "已停用");
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: // @ts-ignore
                    (...[$event]) => {
                        void $event;
                        if (!(onboardingStep.value === 1 && editingChannel.value))
                            throw 0;
                        if (!(editingChannel.value.models.length))
                            throw 0;
                        return (openModel(model));
                        // @ts-ignore
                        [editingChannel, editingChannel,];
                    } },
                type: "button",
                'aria-label': "编辑模型",
            });
            let __VLS_408;
            /** @ts-ignore @type { | typeof __VLS_components.Pencil} */
            Pencil;
            // @ts-ignore
            const __VLS_409 = __VLS_asFunctionalComponent1(__VLS_408, new __VLS_408({
                // @ts-ignore
                size: (14),
            }));
            const __VLS_410 = __VLS_409({
                size: (14),
            }, ...__VLS_functionalComponentArgsRest(__VLS_409));
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: // @ts-ignore
                    (...[$event]) => {
                        void $event;
                        if (!(onboardingStep.value === 1 && editingChannel.value))
                            throw 0;
                        if (!(editingChannel.value.models.length))
                            throw 0;
                        return (removeModel(model));
                        // @ts-ignore
                        [];
                    } },
                type: "button",
                'aria-label': "删除模型",
            });
            let __VLS_413;
            /** @ts-ignore @type { | typeof __VLS_components.Trash2} */
            Trash2;
            // @ts-ignore
            const __VLS_414 = __VLS_asFunctionalComponent1(__VLS_413, new __VLS_413({
                // @ts-ignore
                size: (14),
            }));
            const __VLS_415 = __VLS_414({
                size: (14),
            }, ...__VLS_functionalComponentArgsRest(__VLS_414));
            // @ts-ignore
            [];
        }
    }
    else {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "channel-model-empty" },
        });
        /** @type {__VLS_StyleScopedClasses['channel-model-empty']} */ ;
    }
}
{
    const { footer: __VLS_418 } = __VLS_nonNull(__VLS_194.slots);
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "channel-dialog-footer" },
    });
    /** @type {__VLS_StyleScopedClasses['channel-dialog-footer']} */ ;
    if (onboardingStep.value === 1 && !editingId.value) {
        let __VLS_419;
        /** @ts-ignore @type { | typeof __VLS_components.ElButton | typeof __VLS_components.ElButton} */
        ElButton;
        // @ts-ignore
        const __VLS_420 = __VLS_asFunctionalComponent1(__VLS_419, new __VLS_419({
            // @ts-ignore
            ...{ 'onClick': {} },
        }));
        const __VLS_421 = __VLS_420({
            ...{ 'onClick': {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_420));
        let __VLS_424;
        const __VLS_425 = {
            /** @type {typeof __VLS_424.click} */
            onClick: // @ts-ignore
            (...[$event]) => {
                void $event;
                if (!(onboardingStep.value === 1 && !editingId.value))
                    throw 0;
                return (onboardingStep.value = 0);
                // @ts-ignore
                [editingId, onboardingStep, onboardingStep,];
            },
        };
        void __VLS_425;
        const { default: __VLS_426 } = __VLS_nonNull(__VLS_422.slots);
        let __VLS_427;
        /** @ts-ignore @type { | typeof __VLS_components.ArrowLeft} */
        ArrowLeft;
        // @ts-ignore
        const __VLS_428 = __VLS_asFunctionalComponent1(__VLS_427, new __VLS_427({
            // @ts-ignore
            size: (14),
        }));
        const __VLS_429 = __VLS_428({
            size: (14),
        }, ...__VLS_functionalComponentArgsRest(__VLS_428));
        // @ts-ignore
        [];
        var __VLS_422;
        var __VLS_423;
    }
    if (editingChannel.value) {
        let __VLS_432;
        /** @ts-ignore @type { | typeof __VLS_components.ElButton | typeof __VLS_components.ElButton} */
        ElButton;
        // @ts-ignore
        const __VLS_433 = __VLS_asFunctionalComponent1(__VLS_432, new __VLS_432({
            // @ts-ignore
            ...{ 'onClick': {} }, type: "danger", plain: true,
        }));
        const __VLS_434 = __VLS_433({
            ...{ 'onClick': {} },
            type: "danger",
            plain: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_433));
        let __VLS_437;
        const __VLS_438 = {
            /** @type {typeof __VLS_437.click} */
            onClick: // @ts-ignore
            (...[$event]) => {
                void $event;
                if (!(editingChannel.value))
                    throw 0;
                return (removeChannel(editingChannel.value));
                // @ts-ignore
                [editingChannel, editingChannel,];
            },
        };
        void __VLS_438;
        const { default: __VLS_439 } = __VLS_nonNull(__VLS_435.slots);
        let __VLS_440;
        /** @ts-ignore @type { | typeof __VLS_components.Trash2} */
        Trash2;
        // @ts-ignore
        const __VLS_441 = __VLS_asFunctionalComponent1(__VLS_440, new __VLS_440({
            // @ts-ignore
            size: (14),
        }));
        const __VLS_442 = __VLS_441({
            size: (14),
        }, ...__VLS_functionalComponentArgsRest(__VLS_441));
        // @ts-ignore
        [];
        var __VLS_435;
        var __VLS_436;
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.span)({});
    let __VLS_445;
    /** @ts-ignore @type { | typeof __VLS_components.ElButton | typeof __VLS_components.ElButton} */
    ElButton;
    // @ts-ignore
    const __VLS_446 = __VLS_asFunctionalComponent1(__VLS_445, new __VLS_445({
        // @ts-ignore
        ...{ 'onClick': {} },
    }));
    const __VLS_447 = __VLS_446({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_446));
    let __VLS_450;
    const __VLS_451 = {
        /** @type {typeof __VLS_450.click} */
        onClick: // @ts-ignore
        (...[$event]) => {
            void $event;
            return (dialogOpen.value = false);
            // @ts-ignore
            [dialogOpen,];
        },
    };
    void __VLS_451;
    const { default: __VLS_452 } = __VLS_nonNull(__VLS_448.slots);
    // @ts-ignore
    [];
    var __VLS_448;
    var __VLS_449;
    if (onboardingStep.value === 0) {
        let __VLS_453;
        /** @ts-ignore @type { | typeof __VLS_components.ElButton | typeof __VLS_components.ElButton} */
        ElButton;
        // @ts-ignore
        const __VLS_454 = __VLS_asFunctionalComponent1(__VLS_453, new __VLS_453({
            // @ts-ignore
            ...{ 'onClick': {} }, type: "primary",
        }));
        const __VLS_455 = __VLS_454({
            ...{ 'onClick': {} },
            type: "primary",
        }, ...__VLS_functionalComponentArgsRest(__VLS_454));
        let __VLS_458;
        const __VLS_459 = {
            /** @type {typeof __VLS_458.click} */
            onClick: (continueOnboarding),
        };
        void __VLS_459;
        const { default: __VLS_460 } = __VLS_nonNull(__VLS_456.slots);
        // @ts-ignore
        [onboardingStep,];
        var __VLS_456;
        var __VLS_457;
    }
    else {
        let __VLS_461;
        /** @ts-ignore @type { | typeof __VLS_components.ElButton | typeof __VLS_components.ElButton} */
        ElButton;
        // @ts-ignore
        const __VLS_462 = __VLS_asFunctionalComponent1(__VLS_461, new __VLS_461({
            // @ts-ignore
            ...{ 'onClick': {} }, type: "primary", loading: (__VLS_unwrap(saving, {})),
        }));
        const __VLS_463 = __VLS_462({
            ...{ 'onClick': {} },
            type: "primary",
            loading: (__VLS_unwrap(saving, {})),
        }, ...__VLS_functionalComponentArgsRest(__VLS_462));
        let __VLS_466;
        const __VLS_467 = {
            /** @type {typeof __VLS_466.click} */
            onClick: (saveChannel),
        };
        void __VLS_467;
        const { default: __VLS_468 } = __VLS_nonNull(__VLS_464.slots);
        // @ts-ignore
        [saving,];
        var __VLS_464;
        var __VLS_465;
    }
    // @ts-ignore
    [];
}
// @ts-ignore
[];
var __VLS_194;
let __VLS_469;
/** @ts-ignore @type { | typeof __VLS_components.ElDialog | typeof __VLS_components.ElDialog} */
ElDialog;
// @ts-ignore
const __VLS_470 = __VLS_asFunctionalComponent1(__VLS_469, new __VLS_469({
    // @ts-ignore
    modelValue: (modelDialogOpen.value), title: (editingModelId.value ? '编辑模型' : '添加模型'), width: "min(560px, calc(100vw - 28px))", appendToBody: true,
}));
const __VLS_471 = __VLS_470({
    modelValue: (modelDialogOpen.value),
    title: (editingModelId.value ? '编辑模型' : '添加模型'),
    width: "min(560px, calc(100vw - 28px))",
    appendToBody: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_470));
const { default: __VLS_474 } = __VLS_nonNull(__VLS_472.slots);
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "channel-form-grid" },
});
/** @type {__VLS_StyleScopedClasses['channel-form-grid']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
let __VLS_475;
/** @ts-ignore @type { | typeof __VLS_components.ElInput} */
ElInput;
// @ts-ignore
const __VLS_476 = __VLS_asFunctionalComponent1(__VLS_475, new __VLS_475({
    // @ts-ignore
    modelValue: (modelForm.value.modelId), placeholder: "gpt-image-2",
}));
const __VLS_477 = __VLS_476({
    modelValue: (modelForm.value.modelId),
    placeholder: "gpt-image-2",
}, ...__VLS_functionalComponentArgsRest(__VLS_476));
__VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
let __VLS_480;
/** @ts-ignore @type { | typeof __VLS_components.ElInput} */
ElInput;
// @ts-ignore
const __VLS_481 = __VLS_asFunctionalComponent1(__VLS_480, new __VLS_480({
    // @ts-ignore
    modelValue: (modelForm.value.displayName), placeholder: "留空则使用模型 ID",
}));
const __VLS_482 = __VLS_481({
    modelValue: (modelForm.value.displayName),
    placeholder: "留空则使用模型 ID",
}, ...__VLS_functionalComponentArgsRest(__VLS_481));
__VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
let __VLS_485;
/** @ts-ignore @type { | typeof __VLS_components.ElSelect | typeof __VLS_components.ElSelect} */
ElSelect;
// @ts-ignore
const __VLS_486 = __VLS_asFunctionalComponent1(__VLS_485, new __VLS_485({
    // @ts-ignore
    modelValue: (modelForm.value.capability),
}));
const __VLS_487 = __VLS_486({
    modelValue: (modelForm.value.capability),
}, ...__VLS_functionalComponentArgsRest(__VLS_486));
const { default: __VLS_490 } = __VLS_nonNull(__VLS_488.slots);
let __VLS_491;
/** @ts-ignore @type { | typeof __VLS_components.ElOption} */
ElOption;
// @ts-ignore
const __VLS_492 = __VLS_asFunctionalComponent1(__VLS_491, new __VLS_491({
    // @ts-ignore
    label: "文本", value: "text",
}));
const __VLS_493 = __VLS_492({
    label: "文本",
    value: "text",
}, ...__VLS_functionalComponentArgsRest(__VLS_492));
let __VLS_496;
/** @ts-ignore @type { | typeof __VLS_components.ElOption} */
ElOption;
// @ts-ignore
const __VLS_497 = __VLS_asFunctionalComponent1(__VLS_496, new __VLS_496({
    // @ts-ignore
    label: "图片", value: "image",
}));
const __VLS_498 = __VLS_497({
    label: "图片",
    value: "image",
}, ...__VLS_functionalComponentArgsRest(__VLS_497));
let __VLS_501;
/** @ts-ignore @type { | typeof __VLS_components.ElOption} */
ElOption;
// @ts-ignore
const __VLS_502 = __VLS_asFunctionalComponent1(__VLS_501, new __VLS_501({
    // @ts-ignore
    label: "视频", value: "video",
}));
const __VLS_503 = __VLS_502({
    label: "视频",
    value: "video",
}, ...__VLS_functionalComponentArgsRest(__VLS_502));
let __VLS_506;
/** @ts-ignore @type { | typeof __VLS_components.ElOption} */
ElOption;
// @ts-ignore
const __VLS_507 = __VLS_asFunctionalComponent1(__VLS_506, new __VLS_506({
    // @ts-ignore
    label: "音频", value: "audio",
}));
const __VLS_508 = __VLS_507({
    label: "音频",
    value: "audio",
}, ...__VLS_functionalComponentArgsRest(__VLS_507));
// @ts-ignore
[modelDialogOpen, editingModelId, modelForm, modelForm, modelForm,];
var __VLS_488;
__VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
let __VLS_511;
/** @ts-ignore @type { | typeof __VLS_components.ElInput} */
ElInput;
// @ts-ignore
const __VLS_512 = __VLS_asFunctionalComponent1(__VLS_511, new __VLS_511({
    // @ts-ignore
    modelValue: (modelForm.value.sortOrder), modelModifiers: { number: true, }, type: "number", min: "0",
}));
const __VLS_513 = __VLS_512({
    modelValue: (modelForm.value.sortOrder),
    modelModifiers: { number: true, },
    type: "number",
    min: "0",
}, ...__VLS_functionalComponentArgsRest(__VLS_512));
__VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
    ...{ class: "channel-switch-row" },
});
/** @type {__VLS_StyleScopedClasses['channel-switch-row']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.small, __VLS_intrinsics.small)({});
let __VLS_516;
/** @ts-ignore @type { | typeof __VLS_components.ElSwitch} */
ElSwitch;
// @ts-ignore
const __VLS_517 = __VLS_asFunctionalComponent1(__VLS_516, new __VLS_516({
    // @ts-ignore
    modelValue: (modelForm.value.enabled),
}));
const __VLS_518 = __VLS_517({
    modelValue: (modelForm.value.enabled),
}, ...__VLS_functionalComponentArgsRest(__VLS_517));
{
    const { footer: __VLS_521 } = __VLS_nonNull(__VLS_472.slots);
    let __VLS_522;
    /** @ts-ignore @type { | typeof __VLS_components.ElButton | typeof __VLS_components.ElButton} */
    ElButton;
    // @ts-ignore
    const __VLS_523 = __VLS_asFunctionalComponent1(__VLS_522, new __VLS_522({
        // @ts-ignore
        ...{ 'onClick': {} },
    }));
    const __VLS_524 = __VLS_523({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_523));
    let __VLS_527;
    const __VLS_528 = {
        /** @type {typeof __VLS_527.click} */
        onClick: // @ts-ignore
        (...[$event]) => {
            void $event;
            return (modelDialogOpen.value = false);
            // @ts-ignore
            [modelDialogOpen, modelForm, modelForm,];
        },
    };
    void __VLS_528;
    const { default: __VLS_529 } = __VLS_nonNull(__VLS_525.slots);
    // @ts-ignore
    [];
    var __VLS_525;
    var __VLS_526;
    let __VLS_530;
    /** @ts-ignore @type { | typeof __VLS_components.ElButton | typeof __VLS_components.ElButton} */
    ElButton;
    // @ts-ignore
    const __VLS_531 = __VLS_asFunctionalComponent1(__VLS_530, new __VLS_530({
        // @ts-ignore
        ...{ 'onClick': {} }, type: "primary", loading: (__VLS_unwrap(saving, {})),
    }));
    const __VLS_532 = __VLS_531({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_unwrap(saving, {})),
    }, ...__VLS_functionalComponentArgsRest(__VLS_531));
    let __VLS_535;
    const __VLS_536 = {
        /** @type {typeof __VLS_535.click} */
        onClick: (saveModel),
    };
    void __VLS_536;
    const { default: __VLS_537 } = __VLS_nonNull(__VLS_533.slots);
    // @ts-ignore
    [saving,];
    var __VLS_533;
    var __VLS_534;
    // @ts-ignore
    [];
}
// @ts-ignore
[];
var __VLS_472;
// @ts-ignore
[];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
