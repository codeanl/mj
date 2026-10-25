import { computed, onMounted, reactive, ref } from "vue";
import { ElButton, ElDialog, ElInput, ElMessage, ElMessageBox, ElOption, ElSelect, ElSwitch } from "element-plus";
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
const dialogOpen = ref(false);
const onboardingStep = ref(0);
const editingId = ref("");
const modelDialogOpen = ref(false);
const editingModelId = ref("");
const channelForm = reactive({ name: "", baseUrl: "", protocol: "openai", apiKey: "", enabled: false, advancedConfig: emptyAdvancedConfig() });
const modelForm = reactive({ modelId: "", displayName: "", capability: "image", enabled: true, sortOrder: 0 });
const editingChannel = computed(() => channels.value.find((channel) => channel.id === editingId.value));
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
onMounted(() => void Promise.all([loadChannels(), loadProtocols()]));
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
    Object.assign(channelForm, { name: "", baseUrl: "", protocol: "openai", apiKey: "", enabled: false, advancedConfig: emptyAdvancedConfig() });
    dialogOpen.value = true;
}
function openEdit(channel) {
    editingId.value = channel.id;
    onboardingStep.value = 1;
    Object.assign(channelForm, { name: channel.name, baseUrl: channel.baseUrl, protocol: channel.protocol, apiKey: "", enabled: channel.enabled, advancedConfig: cloneData(channel.advancedConfig) });
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
        await channelApi.updateChannel(channel.id, { name: channel.name, baseUrl: channel.baseUrl, protocol: channel.protocol, enabled, advancedConfig: channel.advancedConfig });
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
    ...{ class: "channel-toolbar" },
});
/** @type {__VLS_StyleScopedClasses['channel-toolbar']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
    ...{ class: "channel-search" },
});
/** @type {__VLS_StyleScopedClasses['channel-search']} */ ;
let __VLS_0;
/** @ts-ignore @type { | typeof __VLS_components.Search} */
Search;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
    // @ts-ignore
    size: (16),
}));
const __VLS_2 = __VLS_1({
    size: (16),
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
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
let __VLS_5;
/** @ts-ignore @type { | typeof __VLS_components.Plus} */
Plus;
// @ts-ignore
const __VLS_6 = __VLS_asFunctionalComponent1(__VLS_5, new __VLS_5({
    // @ts-ignore
    size: (16),
}));
const __VLS_7 = __VLS_6({
    size: (16),
}, ...__VLS_functionalComponentArgsRest(__VLS_6));
if (loading.value) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "channel-loading" },
    });
    /** @type {__VLS_StyleScopedClasses['channel-loading']} */ ;
    let __VLS_10;
    /** @ts-ignore @type { | typeof __VLS_components.LoaderCircle} */
    LoaderCircle;
    // @ts-ignore
    const __VLS_11 = __VLS_asFunctionalComponent1(__VLS_10, new __VLS_10({
        // @ts-ignore
        ...{ class: "spin" }, size: (22),
    }));
    const __VLS_12 = __VLS_11({
        ...{ class: "spin" },
        size: (22),
    }, ...__VLS_functionalComponentArgsRest(__VLS_11));
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
    const __VLS_15 = __VLS_tryAsConstant((filteredChannels.value));
    for (const [channel] of __VLS_vFor(__VLS_nonNull(__VLS_15))) {
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
                    [enabledCount, channels, modelCount, enabledModelCount, capabilityCounts, capabilityCounts, capabilityCounts, capabilityCounts, query, status, loading, filteredChannels, filteredChannels,];
                } },
            ...{ class: "channel-name" },
            type: "button",
        });
        /** @type {__VLS_StyleScopedClasses['channel-name']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
        (channel.name);
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
        let __VLS_16;
        /** @ts-ignore @type { | typeof __VLS_components.KeyRound} */
        KeyRound;
        // @ts-ignore
        const __VLS_17 = __VLS_asFunctionalComponent1(__VLS_16, new __VLS_16({
            // @ts-ignore
            size: (12),
        }));
        const __VLS_18 = __VLS_17({
            size: (12),
        }, ...__VLS_functionalComponentArgsRest(__VLS_17));
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
            ...{ class: ({ 'is-enabled': channel.enabled, 'is-error': channel.lastTestStatus === 'failed' }) },
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
            let __VLS_21;
            /** @ts-ignore @type { | typeof __VLS_components.CheckCircle2} */
            CheckCircle2;
            // @ts-ignore
            const __VLS_22 = __VLS_asFunctionalComponent1(__VLS_21, new __VLS_21({
                // @ts-ignore
                size: (14),
            }));
            const __VLS_23 = __VLS_22({
                size: (14),
            }, ...__VLS_functionalComponentArgsRest(__VLS_22));
        }
        else if (channel.lastTestStatus === 'failed') {
            let __VLS_26;
            /** @ts-ignore @type { | typeof __VLS_components.XCircle} */
            XCircle;
            // @ts-ignore
            const __VLS_27 = __VLS_asFunctionalComponent1(__VLS_26, new __VLS_26({
                // @ts-ignore
                size: (14),
            }));
            const __VLS_28 = __VLS_27({
                size: (14),
            }, ...__VLS_functionalComponentArgsRest(__VLS_27));
        }
        else {
            let __VLS_31;
            /** @ts-ignore @type { | typeof __VLS_components.CircleAlert} */
            CircleAlert;
            // @ts-ignore
            const __VLS_32 = __VLS_asFunctionalComponent1(__VLS_31, new __VLS_31({
                // @ts-ignore
                size: (14),
            }));
            const __VLS_33 = __VLS_32({
                size: (14),
            }, ...__VLS_functionalComponentArgsRest(__VLS_32));
        }
        (channel.lastTestMessage || "尚未检测");
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
            let __VLS_36;
            /** @ts-ignore @type { | typeof __VLS_components.LoaderCircle} */
            LoaderCircle;
            // @ts-ignore
            const __VLS_37 = __VLS_asFunctionalComponent1(__VLS_36, new __VLS_36({
                // @ts-ignore
                ...{ class: "spin" }, size: (15),
            }));
            const __VLS_38 = __VLS_37({
                ...{ class: "spin" },
                size: (15),
            }, ...__VLS_functionalComponentArgsRest(__VLS_37));
            /** @type {__VLS_StyleScopedClasses['spin']} */ ;
        }
        else {
            let __VLS_41;
            /** @ts-ignore @type { | typeof __VLS_components.CheckCircle2} */
            CheckCircle2;
            // @ts-ignore
            const __VLS_42 = __VLS_asFunctionalComponent1(__VLS_41, new __VLS_41({
                // @ts-ignore
                size: (15),
            }));
            const __VLS_43 = __VLS_42({
                size: (15),
            }, ...__VLS_functionalComponentArgsRest(__VLS_42));
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
            let __VLS_46;
            /** @ts-ignore @type { | typeof __VLS_components.LoaderCircle} */
            LoaderCircle;
            // @ts-ignore
            const __VLS_47 = __VLS_asFunctionalComponent1(__VLS_46, new __VLS_46({
                // @ts-ignore
                ...{ class: "spin" }, size: (15),
            }));
            const __VLS_48 = __VLS_47({
                ...{ class: "spin" },
                size: (15),
            }, ...__VLS_functionalComponentArgsRest(__VLS_47));
            /** @type {__VLS_StyleScopedClasses['spin']} */ ;
        }
        else {
            let __VLS_51;
            /** @ts-ignore @type { | typeof __VLS_components.RefreshCw} */
            RefreshCw;
            // @ts-ignore
            const __VLS_52 = __VLS_asFunctionalComponent1(__VLS_51, new __VLS_51({
                // @ts-ignore
                size: (15),
            }));
            const __VLS_53 = __VLS_52({
                size: (15),
            }, ...__VLS_functionalComponentArgsRest(__VLS_52));
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
        let __VLS_56;
        /** @ts-ignore @type { | typeof __VLS_components.Pencil} */
        Pencil;
        // @ts-ignore
        const __VLS_57 = __VLS_asFunctionalComponent1(__VLS_56, new __VLS_56({
            // @ts-ignore
            size: (15),
        }));
        const __VLS_58 = __VLS_57({
            size: (15),
        }, ...__VLS_functionalComponentArgsRest(__VLS_57));
        let __VLS_61;
        /** @ts-ignore @type { | typeof __VLS_components.ElSwitch} */
        ElSwitch;
        // @ts-ignore
        const __VLS_62 = __VLS_asFunctionalComponent1(__VLS_61, new __VLS_61({
            // @ts-ignore
            ...{ 'onChange': {} }, modelValue: (channel.enabled),
        }));
        const __VLS_63 = __VLS_62({
            ...{ 'onChange': {} },
            modelValue: (channel.enabled),
        }, ...__VLS_functionalComponentArgsRest(__VLS_62));
        let __VLS_66;
        const __VLS_67 = {
            /** @type {typeof __VLS_66.change} */
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
        void __VLS_67;
        var __VLS_64;
        var __VLS_65;
        // @ts-ignore
        [];
    }
}
if (!loading.value && filteredChannels.value.length) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "channel-mobile-list" },
    });
    /** @type {__VLS_StyleScopedClasses['channel-mobile-list']} */ ;
    const __VLS_68 = __VLS_tryAsConstant((filteredChannels.value));
    for (const [channel] of __VLS_vFor(__VLS_nonNull(__VLS_68))) {
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
        let __VLS_69;
        /** @ts-ignore @type { | typeof __VLS_components.KeyRound} */
        KeyRound;
        // @ts-ignore
        const __VLS_70 = __VLS_asFunctionalComponent1(__VLS_69, new __VLS_69({
            // @ts-ignore
            size: (12),
        }));
        const __VLS_71 = __VLS_70({
            size: (12),
        }, ...__VLS_functionalComponentArgsRest(__VLS_70));
        (channel.apiKeyMasked || "未保存密钥");
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "channel-status" },
            ...{ class: ({ 'is-enabled': channel.enabled, 'is-error': channel.lastTestStatus === 'failed' }) },
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
            let __VLS_74;
            /** @ts-ignore @type { | typeof __VLS_components.CheckCircle2} */
            CheckCircle2;
            // @ts-ignore
            const __VLS_75 = __VLS_asFunctionalComponent1(__VLS_74, new __VLS_74({
                // @ts-ignore
                size: (14),
            }));
            const __VLS_76 = __VLS_75({
                size: (14),
            }, ...__VLS_functionalComponentArgsRest(__VLS_75));
        }
        else if (channel.lastTestStatus === 'failed') {
            let __VLS_79;
            /** @ts-ignore @type { | typeof __VLS_components.XCircle} */
            XCircle;
            // @ts-ignore
            const __VLS_80 = __VLS_asFunctionalComponent1(__VLS_79, new __VLS_79({
                // @ts-ignore
                size: (14),
            }));
            const __VLS_81 = __VLS_80({
                size: (14),
            }, ...__VLS_functionalComponentArgsRest(__VLS_80));
        }
        else {
            let __VLS_84;
            /** @ts-ignore @type { | typeof __VLS_components.CircleAlert} */
            CircleAlert;
            // @ts-ignore
            const __VLS_85 = __VLS_asFunctionalComponent1(__VLS_84, new __VLS_84({
                // @ts-ignore
                size: (14),
            }));
            const __VLS_86 = __VLS_85({
                size: (14),
            }, ...__VLS_functionalComponentArgsRest(__VLS_85));
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
        (channel.lastTestMessage || "尚未检测");
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
            let __VLS_89;
            /** @ts-ignore @type { | typeof __VLS_components.LoaderCircle} */
            LoaderCircle;
            // @ts-ignore
            const __VLS_90 = __VLS_asFunctionalComponent1(__VLS_89, new __VLS_89({
                // @ts-ignore
                ...{ class: "spin" }, size: (15),
            }));
            const __VLS_91 = __VLS_90({
                ...{ class: "spin" },
                size: (15),
            }, ...__VLS_functionalComponentArgsRest(__VLS_90));
            /** @type {__VLS_StyleScopedClasses['spin']} */ ;
        }
        else {
            let __VLS_94;
            /** @ts-ignore @type { | typeof __VLS_components.CheckCircle2} */
            CheckCircle2;
            // @ts-ignore
            const __VLS_95 = __VLS_asFunctionalComponent1(__VLS_94, new __VLS_94({
                // @ts-ignore
                size: (15),
            }));
            const __VLS_96 = __VLS_95({
                size: (15),
            }, ...__VLS_functionalComponentArgsRest(__VLS_95));
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
            let __VLS_99;
            /** @ts-ignore @type { | typeof __VLS_components.LoaderCircle} */
            LoaderCircle;
            // @ts-ignore
            const __VLS_100 = __VLS_asFunctionalComponent1(__VLS_99, new __VLS_99({
                // @ts-ignore
                ...{ class: "spin" }, size: (15),
            }));
            const __VLS_101 = __VLS_100({
                ...{ class: "spin" },
                size: (15),
            }, ...__VLS_functionalComponentArgsRest(__VLS_100));
            /** @type {__VLS_StyleScopedClasses['spin']} */ ;
        }
        else {
            let __VLS_104;
            /** @ts-ignore @type { | typeof __VLS_components.RefreshCw} */
            RefreshCw;
            // @ts-ignore
            const __VLS_105 = __VLS_asFunctionalComponent1(__VLS_104, new __VLS_104({
                // @ts-ignore
                size: (15),
            }));
            const __VLS_106 = __VLS_105({
                size: (15),
            }, ...__VLS_functionalComponentArgsRest(__VLS_105));
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
        let __VLS_109;
        /** @ts-ignore @type { | typeof __VLS_components.Pencil} */
        Pencil;
        // @ts-ignore
        const __VLS_110 = __VLS_asFunctionalComponent1(__VLS_109, new __VLS_109({
            // @ts-ignore
            size: (15),
        }));
        const __VLS_111 = __VLS_110({
            size: (15),
        }, ...__VLS_functionalComponentArgsRest(__VLS_110));
        let __VLS_114;
        /** @ts-ignore @type { | typeof __VLS_components.ElSwitch} */
        ElSwitch;
        // @ts-ignore
        const __VLS_115 = __VLS_asFunctionalComponent1(__VLS_114, new __VLS_114({
            // @ts-ignore
            ...{ 'onChange': {} }, modelValue: (channel.enabled),
        }));
        const __VLS_116 = __VLS_115({
            ...{ 'onChange': {} },
            modelValue: (channel.enabled),
        }, ...__VLS_functionalComponentArgsRest(__VLS_115));
        let __VLS_119;
        const __VLS_120 = {
            /** @type {typeof __VLS_119.change} */
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
        void __VLS_120;
        var __VLS_117;
        var __VLS_118;
        // @ts-ignore
        [];
    }
}
if (!loading.value && !filteredChannels.value.length) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "channel-empty" },
    });
    /** @type {__VLS_StyleScopedClasses['channel-empty']} */ ;
    let __VLS_121;
    /** @ts-ignore @type { | typeof __VLS_components.KeyRound} */
    KeyRound;
    // @ts-ignore
    const __VLS_122 = __VLS_asFunctionalComponent1(__VLS_121, new __VLS_121({
        // @ts-ignore
        size: (28),
    }));
    const __VLS_123 = __VLS_122({
        size: (28),
    }, ...__VLS_functionalComponentArgsRest(__VLS_122));
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
        let __VLS_126;
        /** @ts-ignore @type { | typeof __VLS_components.Plus} */
        Plus;
        // @ts-ignore
        const __VLS_127 = __VLS_asFunctionalComponent1(__VLS_126, new __VLS_126({
            // @ts-ignore
            size: (16),
        }));
        const __VLS_128 = __VLS_127({
            size: (16),
        }, ...__VLS_functionalComponentArgsRest(__VLS_127));
    }
}
let __VLS_131;
/** @ts-ignore @type { | typeof __VLS_components.ElDialog | typeof __VLS_components.ElDialog} */
ElDialog;
// @ts-ignore
const __VLS_132 = __VLS_asFunctionalComponent1(__VLS_131, new __VLS_131({
    // @ts-ignore
    modelValue: (dialogOpen.value), title: (editingId.value ? '编辑模型渠道' : onboardingStep.value === 0 ? '选择渠道协议' : '接入模型渠道'), width: "min(760px, calc(100vw - 28px))", destroyOnClose: true,
}));
const __VLS_133 = __VLS_132({
    modelValue: (dialogOpen.value),
    title: (editingId.value ? '编辑模型渠道' : onboardingStep.value === 0 ? '选择渠道协议' : '接入模型渠道'),
    width: "min(760px, calc(100vw - 28px))",
    destroyOnClose: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_132));
const { default: __VLS_136 } = __VLS_nonNull(__VLS_134.slots);
if (onboardingStep.value === 0) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "protocol-grid" },
    });
    /** @type {__VLS_StyleScopedClasses['protocol-grid']} */ ;
    const __VLS_137 = __VLS_tryAsConstant((__VLS_unwrap(protocols, {})));
    for (const [protocol] of __VLS_vFor(__VLS_nonNull(__VLS_137))) {
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
            let __VLS_138;
            /** @ts-ignore @type { | typeof __VLS_components.Check} */
            Check;
            // @ts-ignore
            const __VLS_139 = __VLS_asFunctionalComponent1(__VLS_138, new __VLS_138({
                // @ts-ignore
                size: (16),
            }));
            const __VLS_140 = __VLS_139({
                size: (16),
            }, ...__VLS_functionalComponentArgsRest(__VLS_139));
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({});
        (protocol.description);
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "protocol-capabilities" },
        });
        /** @type {__VLS_StyleScopedClasses['protocol-capabilities']} */ ;
        const __VLS_143 = __VLS_tryAsConstant((protocol.capabilities));
        for (const [capability] of __VLS_vFor(__VLS_nonNull(__VLS_143))) {
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
    let __VLS_144;
    /** @ts-ignore @type { | typeof __VLS_components.ElInput} */
    ElInput;
    // @ts-ignore
    const __VLS_145 = __VLS_asFunctionalComponent1(__VLS_144, new __VLS_144({
        // @ts-ignore
        modelValue: (channelForm.value.name), placeholder: "例如：生产主渠道",
    }));
    const __VLS_146 = __VLS_145({
        modelValue: (channelForm.value.name),
        placeholder: "例如：生产主渠道",
    }, ...__VLS_functionalComponentArgsRest(__VLS_145));
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    let __VLS_149;
    /** @ts-ignore @type { | typeof __VLS_components.ElSelect | typeof __VLS_components.ElSelect} */
    ElSelect;
    // @ts-ignore
    const __VLS_150 = __VLS_asFunctionalComponent1(__VLS_149, new __VLS_149({
        // @ts-ignore
        modelValue: (channelForm.value.protocol), disabled: true,
    }));
    const __VLS_151 = __VLS_150({
        modelValue: (channelForm.value.protocol),
        disabled: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_150));
    const { default: __VLS_154 } = __VLS_nonNull(__VLS_152.slots);
    let __VLS_155;
    /** @ts-ignore @type { | typeof __VLS_components.ElOption} */
    ElOption;
    // @ts-ignore
    const __VLS_156 = __VLS_asFunctionalComponent1(__VLS_155, new __VLS_155({
        // @ts-ignore
        label: (selectedProtocol.value?.label || channelForm.value.protocol), value: (channelForm.value.protocol),
    }));
    const __VLS_157 = __VLS_156({
        label: (selectedProtocol.value?.label || channelForm.value.protocol),
        value: (channelForm.value.protocol),
    }, ...__VLS_functionalComponentArgsRest(__VLS_156));
    // @ts-ignore
    [channelForm, channelForm, channelForm, channelForm, selectedProtocol,];
    var __VLS_152;
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
        ...{ class: "channel-form-wide" },
    });
    /** @type {__VLS_StyleScopedClasses['channel-form-wide']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    let __VLS_160;
    /** @ts-ignore @type { | typeof __VLS_components.ElInput} */
    ElInput;
    // @ts-ignore
    const __VLS_161 = __VLS_asFunctionalComponent1(__VLS_160, new __VLS_160({
        // @ts-ignore
        modelValue: (channelForm.value.baseUrl), placeholder: "https:/*api.example.com/v1", *() { }
    } / ));
}
;
const __VLS_162 = __VLS_161({
    modelValue: (channelForm.value.baseUrl),
    placeholder: "https://api.example.com/v1",
}, ...__VLS_functionalComponentArgsRest(__VLS_161));
__VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
    ...{ class: "channel-form-wide" },
});
/** @type {__VLS_StyleScopedClasses['channel-form-wide']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
let __VLS_165;
/** @ts-ignore @type { | typeof __VLS_components.ElInput} */
ElInput;
// @ts-ignore
const __VLS_166 = __VLS_asFunctionalComponent1(__VLS_165, new __VLS_165({
    // @ts-ignore
    modelValue: (channelForm.value.apiKey), type: "password", showPassword: true, placeholder: (editingChannel.value?.hasApiKey ? `已保存 ${editingChannel.value.apiKeyMasked}，留空保持不变` : '输入 API Key'),
}));
const __VLS_167 = __VLS_166({
    modelValue: (channelForm.value.apiKey),
    type: "password",
    showPassword: true,
    placeholder: (editingChannel.value?.hasApiKey ? `已保存 ${editingChannel.value.apiKeyMasked}，留空保持不变` : '输入 API Key'),
}, ...__VLS_functionalComponentArgsRest(__VLS_166));
__VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
    ...{ class: "channel-switch-row" },
});
/** @type {__VLS_StyleScopedClasses['channel-switch-row']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.small, __VLS_intrinsics.small)({});
let __VLS_170;
/** @ts-ignore @type { | typeof __VLS_components.ElSwitch} */
ElSwitch;
// @ts-ignore
const __VLS_171 = __VLS_asFunctionalComponent1(__VLS_170, new __VLS_170({
    // @ts-ignore
    modelValue: (channelForm.value.enabled),
}));
const __VLS_172 = __VLS_171({
    modelValue: (channelForm.value.enabled),
}, ...__VLS_functionalComponentArgsRest(__VLS_171));
__VLS_asFunctionalElement1(__VLS_intrinsics.details, __VLS_intrinsics.details)({
    ...{ class: "channel-advanced channel-form-wide" },
});
/** @type {__VLS_StyleScopedClasses['channel-advanced']} */ ;
/** @type {__VLS_StyleScopedClasses['channel-form-wide']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.summary, __VLS_intrinsics.summary)({});
let __VLS_175;
/** @ts-ignore @type { | typeof __VLS_components.Settings2} */
Settings2;
// @ts-ignore
const __VLS_176 = __VLS_asFunctionalComponent1(__VLS_175, new __VLS_175({
    // @ts-ignore
    size: (15),
}));
const __VLS_177 = __VLS_176({
    size: (15),
}, ...__VLS_functionalComponentArgsRest(__VLS_176));
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "channel-advanced-grid" },
});
/** @type {__VLS_StyleScopedClasses['channel-advanced-grid']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
let __VLS_180;
/** @ts-ignore @type { | typeof __VLS_components.ElSelect | typeof __VLS_components.ElSelect} */
ElSelect;
// @ts-ignore
const __VLS_181 = __VLS_asFunctionalComponent1(__VLS_180, new __VLS_180({
    // @ts-ignore
    modelValue: (channelForm.value.advancedConfig.apiFormat), disabled: (selectedProtocol.value?.strict),
}));
const __VLS_182 = __VLS_181({
    modelValue: (channelForm.value.advancedConfig.apiFormat),
    disabled: (selectedProtocol.value?.strict),
}, ...__VLS_functionalComponentArgsRest(__VLS_181));
const { default: __VLS_185 } = __VLS_nonNull(__VLS_183.slots);
let __VLS_186;
/** @ts-ignore @type { | typeof __VLS_components.ElOption} */
ElOption;
// @ts-ignore
const __VLS_187 = __VLS_asFunctionalComponent1(__VLS_186, new __VLS_186({
    // @ts-ignore
    label: "OpenAI", value: "openai",
}));
const __VLS_188 = __VLS_187({
    label: "OpenAI",
    value: "openai",
}, ...__VLS_functionalComponentArgsRest(__VLS_187));
let __VLS_191;
/** @ts-ignore @type { | typeof __VLS_components.ElOption} */
ElOption;
// @ts-ignore
const __VLS_192 = __VLS_asFunctionalComponent1(__VLS_191, new __VLS_191({
    // @ts-ignore
    label: "Gemini", value: "gemini",
}));
const __VLS_193 = __VLS_192({
    label: "Gemini",
    value: "gemini",
}, ...__VLS_functionalComponentArgsRest(__VLS_192));
// @ts-ignore
[channelForm, channelForm, channelForm, channelForm, selectedProtocol, editingChannel, editingChannel,];
var __VLS_183;
__VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
let __VLS_196;
/** @ts-ignore @type { | typeof __VLS_components.ElSelect | typeof __VLS_components.ElSelect} */
ElSelect;
// @ts-ignore
const __VLS_197 = __VLS_asFunctionalComponent1(__VLS_196, new __VLS_196({
    // @ts-ignore
    modelValue: (channelForm.value.advancedConfig.authMode), disabled: (selectedProtocol.value?.strict),
}));
const __VLS_198 = __VLS_197({
    modelValue: (channelForm.value.advancedConfig.authMode),
    disabled: (selectedProtocol.value?.strict),
}, ...__VLS_functionalComponentArgsRest(__VLS_197));
const { default: __VLS_201 } = __VLS_nonNull(__VLS_199.slots);
let __VLS_202;
/** @ts-ignore @type { | typeof __VLS_components.ElOption} */
ElOption;
// @ts-ignore
const __VLS_203 = __VLS_asFunctionalComponent1(__VLS_202, new __VLS_202({
    // @ts-ignore
    label: "Bearer Token", value: "bearer",
}));
const __VLS_204 = __VLS_203({
    label: "Bearer Token",
    value: "bearer",
}, ...__VLS_functionalComponentArgsRest(__VLS_203));
let __VLS_207;
/** @ts-ignore @type { | typeof __VLS_components.ElOption} */
ElOption;
// @ts-ignore
const __VLS_208 = __VLS_asFunctionalComponent1(__VLS_207, new __VLS_207({
    // @ts-ignore
    label: "x-api-key", value: "x-api-key",
}));
const __VLS_209 = __VLS_208({
    label: "x-api-key",
    value: "x-api-key",
}, ...__VLS_functionalComponentArgsRest(__VLS_208));
let __VLS_212;
/** @ts-ignore @type { | typeof __VLS_components.ElOption} */
ElOption;
// @ts-ignore
const __VLS_213 = __VLS_asFunctionalComponent1(__VLS_212, new __VLS_212({
    // @ts-ignore
    label: "自定义 Header", value: "custom-header",
}));
const __VLS_214 = __VLS_213({
    label: "自定义 Header",
    value: "custom-header",
}, ...__VLS_functionalComponentArgsRest(__VLS_213));
let __VLS_217;
/** @ts-ignore @type { | typeof __VLS_components.ElOption} */
ElOption;
// @ts-ignore
const __VLS_218 = __VLS_asFunctionalComponent1(__VLS_217, new __VLS_217({
    // @ts-ignore
    label: "无需鉴权", value: "none",
}));
const __VLS_219 = __VLS_218({
    label: "无需鉴权",
    value: "none",
}, ...__VLS_functionalComponentArgsRest(__VLS_218));
// @ts-ignore
[channelForm, selectedProtocol,];
var __VLS_199;
if (channelForm.value.advancedConfig.authMode === 'custom-header') {
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    let __VLS_222;
    /** @ts-ignore @type { | typeof __VLS_components.ElInput} */
    ElInput;
    // @ts-ignore
    const __VLS_223 = __VLS_asFunctionalComponent1(__VLS_222, new __VLS_222({
        // @ts-ignore
        modelValue: (channelForm.value.advancedConfig.authHeader), placeholder: "x-api-key",
    }));
    const __VLS_224 = __VLS_223({
        modelValue: (channelForm.value.advancedConfig.authHeader),
        placeholder: "x-api-key",
    }, ...__VLS_functionalComponentArgsRest(__VLS_223));
}
if (channelForm.value.advancedConfig.authMode === 'custom-header') {
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    let __VLS_227;
    /** @ts-ignore @type { | typeof __VLS_components.ElInput} */
    ElInput;
    // @ts-ignore
    const __VLS_228 = __VLS_asFunctionalComponent1(__VLS_227, new __VLS_227({
        // @ts-ignore
        modelValue: (channelForm.value.advancedConfig.authPrefix), placeholder: "可留空",
    }));
    const __VLS_229 = __VLS_228({
        modelValue: (channelForm.value.advancedConfig.authPrefix),
        placeholder: "可留空",
    }, ...__VLS_functionalComponentArgsRest(__VLS_228));
}
__VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
    ...{ class: "channel-form-wide" },
});
/** @type {__VLS_StyleScopedClasses['channel-form-wide']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
let __VLS_232;
/** @ts-ignore @type { | typeof __VLS_components.ElInput} */
ElInput;
// @ts-ignore
const __VLS_233 = __VLS_asFunctionalComponent1(__VLS_232, new __VLS_232({
    // @ts-ignore
    ...{ 'onUpdate:modelValue': {} }, modelValue: (channelForm.value.advancedConfig.modelCatalogPaths.join(', ')), disabled: (selectedProtocol.value?.strict), placeholder: "/v1/models",
}));
const __VLS_234 = __VLS_233({
    ...{ 'onUpdate:modelValue': {} },
    modelValue: (channelForm.value.advancedConfig.modelCatalogPaths.join(', ')),
    disabled: (selectedProtocol.value?.strict),
    placeholder: "/v1/models",
}, ...__VLS_functionalComponentArgsRest(__VLS_233));
let __VLS_237;
const __VLS_238 = {
    /** @type {typeof __VLS_237.'update:modelValue'} */
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
void __VLS_238;
var __VLS_235;
var __VLS_236;
if (selectedProtocol.value?.strict) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "channel-protocol-operations channel-form-wide" },
    });
    /** @type {__VLS_StyleScopedClasses['channel-protocol-operations']} */ ;
    /** @type {__VLS_StyleScopedClasses['channel-form-wide']} */ ;
    const __VLS_239 = __VLS_tryAsConstant((selectedProtocol.value.capabilities));
    for (const [capability] of __VLS_vFor(__VLS_nonNull(__VLS_239))) {
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
    let __VLS_240;
    /** @ts-ignore @type { | typeof __VLS_components.ElInput} */
    ElInput;
    // @ts-ignore
    const __VLS_241 = __VLS_asFunctionalComponent1(__VLS_240, new __VLS_240({
        // @ts-ignore
        modelValue: (channelForm.value.advancedConfig.createPath), placeholder: "/images/generations",
    }));
    const __VLS_242 = __VLS_241({
        modelValue: (channelForm.value.advancedConfig.createPath),
        placeholder: "/images/generations",
    }, ...__VLS_functionalComponentArgsRest(__VLS_241));
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    let __VLS_245;
    /** @ts-ignore @type { | typeof __VLS_components.ElInput} */
    ElInput;
    // @ts-ignore
    const __VLS_246 = __VLS_asFunctionalComponent1(__VLS_245, new __VLS_245({
        // @ts-ignore
        modelValue: (channelForm.value.advancedConfig.queryPath), placeholder: "/tasks/:task_id",
    }));
    const __VLS_247 = __VLS_246({
        modelValue: (channelForm.value.advancedConfig.queryPath),
        placeholder: "/tasks/:task_id",
    }, ...__VLS_functionalComponentArgsRest(__VLS_246));
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    let __VLS_250;
    /** @ts-ignore @type { | typeof __VLS_components.ElInput} */
    ElInput;
    // @ts-ignore
    const __VLS_251 = __VLS_asFunctionalComponent1(__VLS_250, new __VLS_250({
        // @ts-ignore
        modelValue: (channelForm.value.advancedConfig.cancelPath), placeholder: "/tasks/:task_id/cancel",
    }));
    const __VLS_252 = __VLS_251({
        modelValue: (channelForm.value.advancedConfig.cancelPath),
        placeholder: "/tasks/:task_id/cancel",
    }, ...__VLS_functionalComponentArgsRest(__VLS_251));
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    let __VLS_255;
    /** @ts-ignore @type { | typeof __VLS_components.ElSelect | typeof __VLS_components.ElSelect} */
    ElSelect;
    // @ts-ignore
    const __VLS_256 = __VLS_asFunctionalComponent1(__VLS_255, new __VLS_255({
        // @ts-ignore
        modelValue: (channelForm.value.advancedConfig.cancelMethod),
    }));
    const __VLS_257 = __VLS_256({
        modelValue: (channelForm.value.advancedConfig.cancelMethod),
    }, ...__VLS_functionalComponentArgsRest(__VLS_256));
    const { default: __VLS_260 } = __VLS_nonNull(__VLS_258.slots);
    let __VLS_261;
    /** @ts-ignore @type { | typeof __VLS_components.ElOption} */
    ElOption;
    // @ts-ignore
    const __VLS_262 = __VLS_asFunctionalComponent1(__VLS_261, new __VLS_261({
        // @ts-ignore
        label: "POST", value: "POST",
    }));
    const __VLS_263 = __VLS_262({
        label: "POST",
        value: "POST",
    }, ...__VLS_functionalComponentArgsRest(__VLS_262));
    let __VLS_266;
    /** @ts-ignore @type { | typeof __VLS_components.ElOption} */
    ElOption;
    // @ts-ignore
    const __VLS_267 = __VLS_asFunctionalComponent1(__VLS_266, new __VLS_266({
        // @ts-ignore
        label: "DELETE", value: "DELETE",
    }));
    const __VLS_268 = __VLS_267({
        label: "DELETE",
        value: "DELETE",
    }, ...__VLS_functionalComponentArgsRest(__VLS_267));
    // @ts-ignore
    [channelForm, channelForm, channelForm, channelForm,];
    var __VLS_258;
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
        ...{ class: "channel-form-wide" },
    });
    /** @type {__VLS_StyleScopedClasses['channel-form-wide']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    let __VLS_271;
    /** @ts-ignore @type { | typeof __VLS_components.ElInput} */
    ElInput;
    // @ts-ignore
    const __VLS_272 = __VLS_asFunctionalComponent1(__VLS_271, new __VLS_271({
        // @ts-ignore
        modelValue: (channelForm.value.advancedConfig.requestTemplate), type: "textarea", rows: (3), placeholder: '{"model":"{{model}}","prompt":"{{prompt}}"}',
    }));
    const __VLS_273 = __VLS_272({
        modelValue: (channelForm.value.advancedConfig.requestTemplate),
        type: "textarea",
        rows: (3),
        placeholder: '{"model":"{{model}}","prompt":"{{prompt}}"}',
    }, ...__VLS_functionalComponentArgsRest(__VLS_272));
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    let __VLS_276;
    /** @ts-ignore @type { | typeof __VLS_components.ElInput} */
    ElInput;
    // @ts-ignore
    const __VLS_277 = __VLS_asFunctionalComponent1(__VLS_276, new __VLS_276({
        // @ts-ignore
        modelValue: (channelForm.value.advancedConfig.resultField), placeholder: "data[0].url",
    }));
    const __VLS_278 = __VLS_277({
        modelValue: (channelForm.value.advancedConfig.resultField),
        placeholder: "data[0].url",
    }, ...__VLS_functionalComponentArgsRest(__VLS_277));
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    let __VLS_281;
    /** @ts-ignore @type { | typeof __VLS_components.ElInput} */
    ElInput;
    // @ts-ignore
    const __VLS_282 = __VLS_asFunctionalComponent1(__VLS_281, new __VLS_281({
        // @ts-ignore
        modelValue: (channelForm.value.advancedConfig.statusField), placeholder: "status",
    }));
    const __VLS_283 = __VLS_282({
        modelValue: (channelForm.value.advancedConfig.statusField),
        placeholder: "status",
    }, ...__VLS_functionalComponentArgsRest(__VLS_282));
}
__VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
    ...{ class: "channel-form-wide" },
});
/** @type {__VLS_StyleScopedClasses['channel-form-wide']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
let __VLS_286;
/** @ts-ignore @type { | typeof __VLS_components.ElInput} */
ElInput;
// @ts-ignore
const __VLS_287 = __VLS_asFunctionalComponent1(__VLS_286, new __VLS_286({
    // @ts-ignore
    modelValue: (channelForm.value.advancedConfig.documentationUrl), placeholder: "https:/*docs.example.com/api", *() { }
} / ));
;
const __VLS_288 = __VLS_287({
    modelValue: (channelForm.value.advancedConfig.documentationUrl),
    placeholder: "https://docs.example.com/api",
}, ...__VLS_functionalComponentArgsRest(__VLS_287));
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
    let __VLS_291;
    /** @ts-ignore @type { | typeof __VLS_components.ElButton | typeof __VLS_components.ElButton} */
    ElButton;
    // @ts-ignore
    const __VLS_292 = __VLS_asFunctionalComponent1(__VLS_291, new __VLS_291({
        // @ts-ignore
        ...{ 'onClick': {} }, loading: (syncingId.value === editingChannel.value.id),
    }));
    const __VLS_293 = __VLS_292({
        ...{ 'onClick': {} },
        loading: (syncingId.value === editingChannel.value.id),
    }, ...__VLS_functionalComponentArgsRest(__VLS_292));
    let __VLS_296;
    const __VLS_297 = {
        /** @type {typeof __VLS_296.click} */
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
    void __VLS_297;
    const { default: __VLS_298 } = __VLS_nonNull(__VLS_294.slots);
    let __VLS_299;
    /** @ts-ignore @type { | typeof __VLS_components.RefreshCw} */
    RefreshCw;
    // @ts-ignore
    const __VLS_300 = __VLS_asFunctionalComponent1(__VLS_299, new __VLS_299({
        // @ts-ignore
        size: (14),
    }));
    const __VLS_301 = __VLS_300({
        size: (14),
    }, ...__VLS_functionalComponentArgsRest(__VLS_300));
    // @ts-ignore
    [];
    var __VLS_294;
    var __VLS_295;
    let __VLS_304;
    /** @ts-ignore @type { | typeof __VLS_components.ElButton | typeof __VLS_components.ElButton} */
    ElButton;
    // @ts-ignore
    const __VLS_305 = __VLS_asFunctionalComponent1(__VLS_304, new __VLS_304({
        // @ts-ignore
        ...{ 'onClick': {} }, type: "primary",
    }));
    const __VLS_306 = __VLS_305({
        ...{ 'onClick': {} },
        type: "primary",
    }, ...__VLS_functionalComponentArgsRest(__VLS_305));
    let __VLS_309;
    const __VLS_310 = {
        /** @type {typeof __VLS_309.click} */
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
    void __VLS_310;
    const { default: __VLS_311 } = __VLS_nonNull(__VLS_307.slots);
    let __VLS_312;
    /** @ts-ignore @type { | typeof __VLS_components.Plus} */
    Plus;
    // @ts-ignore
    const __VLS_313 = __VLS_asFunctionalComponent1(__VLS_312, new __VLS_312({
        // @ts-ignore
        size: (14),
    }));
    const __VLS_314 = __VLS_313({
        size: (14),
    }, ...__VLS_functionalComponentArgsRest(__VLS_313));
    // @ts-ignore
    [];
    var __VLS_307;
    var __VLS_308;
    if (editingChannel.value.models.length) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "channel-model-list" },
        });
        /** @type {__VLS_StyleScopedClasses['channel-model-list']} */ ;
        const __VLS_317 = __VLS_tryAsConstant((editingChannel.value.models));
        for (const [model] of __VLS_vFor(__VLS_nonNull(__VLS_317))) {
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
            let __VLS_318;
            /** @ts-ignore @type { | typeof __VLS_components.Pencil} */
            Pencil;
            // @ts-ignore
            const __VLS_319 = __VLS_asFunctionalComponent1(__VLS_318, new __VLS_318({
                // @ts-ignore
                size: (14),
            }));
            const __VLS_320 = __VLS_319({
                size: (14),
            }, ...__VLS_functionalComponentArgsRest(__VLS_319));
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
            let __VLS_323;
            /** @ts-ignore @type { | typeof __VLS_components.Trash2} */
            Trash2;
            // @ts-ignore
            const __VLS_324 = __VLS_asFunctionalComponent1(__VLS_323, new __VLS_323({
                // @ts-ignore
                size: (14),
            }));
            const __VLS_325 = __VLS_324({
                size: (14),
            }, ...__VLS_functionalComponentArgsRest(__VLS_324));
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
    const { footer: __VLS_328 } = __VLS_nonNull(__VLS_134.slots);
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "channel-dialog-footer" },
    });
    /** @type {__VLS_StyleScopedClasses['channel-dialog-footer']} */ ;
    if (onboardingStep.value === 1 && !editingId.value) {
        let __VLS_329;
        /** @ts-ignore @type { | typeof __VLS_components.ElButton | typeof __VLS_components.ElButton} */
        ElButton;
        // @ts-ignore
        const __VLS_330 = __VLS_asFunctionalComponent1(__VLS_329, new __VLS_329({
            // @ts-ignore
            ...{ 'onClick': {} },
        }));
        const __VLS_331 = __VLS_330({
            ...{ 'onClick': {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_330));
        let __VLS_334;
        const __VLS_335 = {
            /** @type {typeof __VLS_334.click} */
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
        void __VLS_335;
        const { default: __VLS_336 } = __VLS_nonNull(__VLS_332.slots);
        let __VLS_337;
        /** @ts-ignore @type { | typeof __VLS_components.ArrowLeft} */
        ArrowLeft;
        // @ts-ignore
        const __VLS_338 = __VLS_asFunctionalComponent1(__VLS_337, new __VLS_337({
            // @ts-ignore
            size: (14),
        }));
        const __VLS_339 = __VLS_338({
            size: (14),
        }, ...__VLS_functionalComponentArgsRest(__VLS_338));
        // @ts-ignore
        [];
        var __VLS_332;
        var __VLS_333;
    }
    if (editingChannel.value) {
        let __VLS_342;
        /** @ts-ignore @type { | typeof __VLS_components.ElButton | typeof __VLS_components.ElButton} */
        ElButton;
        // @ts-ignore
        const __VLS_343 = __VLS_asFunctionalComponent1(__VLS_342, new __VLS_342({
            // @ts-ignore
            ...{ 'onClick': {} }, type: "danger", plain: true,
        }));
        const __VLS_344 = __VLS_343({
            ...{ 'onClick': {} },
            type: "danger",
            plain: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_343));
        let __VLS_347;
        const __VLS_348 = {
            /** @type {typeof __VLS_347.click} */
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
        void __VLS_348;
        const { default: __VLS_349 } = __VLS_nonNull(__VLS_345.slots);
        let __VLS_350;
        /** @ts-ignore @type { | typeof __VLS_components.Trash2} */
        Trash2;
        // @ts-ignore
        const __VLS_351 = __VLS_asFunctionalComponent1(__VLS_350, new __VLS_350({
            // @ts-ignore
            size: (14),
        }));
        const __VLS_352 = __VLS_351({
            size: (14),
        }, ...__VLS_functionalComponentArgsRest(__VLS_351));
        // @ts-ignore
        [];
        var __VLS_345;
        var __VLS_346;
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.span)({});
    let __VLS_355;
    /** @ts-ignore @type { | typeof __VLS_components.ElButton | typeof __VLS_components.ElButton} */
    ElButton;
    // @ts-ignore
    const __VLS_356 = __VLS_asFunctionalComponent1(__VLS_355, new __VLS_355({
        // @ts-ignore
        ...{ 'onClick': {} },
    }));
    const __VLS_357 = __VLS_356({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_356));
    let __VLS_360;
    const __VLS_361 = {
        /** @type {typeof __VLS_360.click} */
        onClick: // @ts-ignore
        (...[$event]) => {
            void $event;
            return (dialogOpen.value = false);
            // @ts-ignore
            [dialogOpen,];
        },
    };
    void __VLS_361;
    const { default: __VLS_362 } = __VLS_nonNull(__VLS_358.slots);
    // @ts-ignore
    [];
    var __VLS_358;
    var __VLS_359;
    if (onboardingStep.value === 0) {
        let __VLS_363;
        /** @ts-ignore @type { | typeof __VLS_components.ElButton | typeof __VLS_components.ElButton} */
        ElButton;
        // @ts-ignore
        const __VLS_364 = __VLS_asFunctionalComponent1(__VLS_363, new __VLS_363({
            // @ts-ignore
            ...{ 'onClick': {} }, type: "primary",
        }));
        const __VLS_365 = __VLS_364({
            ...{ 'onClick': {} },
            type: "primary",
        }, ...__VLS_functionalComponentArgsRest(__VLS_364));
        let __VLS_368;
        const __VLS_369 = {
            /** @type {typeof __VLS_368.click} */
            onClick: (continueOnboarding),
        };
        void __VLS_369;
        const { default: __VLS_370 } = __VLS_nonNull(__VLS_366.slots);
        // @ts-ignore
        [onboardingStep,];
        var __VLS_366;
        var __VLS_367;
    }
    else {
        let __VLS_371;
        /** @ts-ignore @type { | typeof __VLS_components.ElButton | typeof __VLS_components.ElButton} */
        ElButton;
        // @ts-ignore
        const __VLS_372 = __VLS_asFunctionalComponent1(__VLS_371, new __VLS_371({
            // @ts-ignore
            ...{ 'onClick': {} }, type: "primary", loading: (__VLS_unwrap(saving, {})),
        }));
        const __VLS_373 = __VLS_372({
            ...{ 'onClick': {} },
            type: "primary",
            loading: (__VLS_unwrap(saving, {})),
        }, ...__VLS_functionalComponentArgsRest(__VLS_372));
        let __VLS_376;
        const __VLS_377 = {
            /** @type {typeof __VLS_376.click} */
            onClick: (saveChannel),
        };
        void __VLS_377;
        const { default: __VLS_378 } = __VLS_nonNull(__VLS_374.slots);
        // @ts-ignore
        [saving,];
        var __VLS_374;
        var __VLS_375;
    }
    // @ts-ignore
    [];
}
// @ts-ignore
[];
var __VLS_134;
let __VLS_379;
/** @ts-ignore @type { | typeof __VLS_components.ElDialog | typeof __VLS_components.ElDialog} */
ElDialog;
// @ts-ignore
const __VLS_380 = __VLS_asFunctionalComponent1(__VLS_379, new __VLS_379({
    // @ts-ignore
    modelValue: (modelDialogOpen.value), title: (editingModelId.value ? '编辑模型' : '添加模型'), width: "min(560px, calc(100vw - 28px))", appendToBody: true,
}));
const __VLS_381 = __VLS_380({
    modelValue: (modelDialogOpen.value),
    title: (editingModelId.value ? '编辑模型' : '添加模型'),
    width: "min(560px, calc(100vw - 28px))",
    appendToBody: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_380));
const { default: __VLS_384 } = __VLS_nonNull(__VLS_382.slots);
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "channel-form-grid" },
});
/** @type {__VLS_StyleScopedClasses['channel-form-grid']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
let __VLS_385;
/** @ts-ignore @type { | typeof __VLS_components.ElInput} */
ElInput;
// @ts-ignore
const __VLS_386 = __VLS_asFunctionalComponent1(__VLS_385, new __VLS_385({
    // @ts-ignore
    modelValue: (modelForm.value.modelId), placeholder: "gpt-image-2",
}));
const __VLS_387 = __VLS_386({
    modelValue: (modelForm.value.modelId),
    placeholder: "gpt-image-2",
}, ...__VLS_functionalComponentArgsRest(__VLS_386));
__VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
let __VLS_390;
/** @ts-ignore @type { | typeof __VLS_components.ElInput} */
ElInput;
// @ts-ignore
const __VLS_391 = __VLS_asFunctionalComponent1(__VLS_390, new __VLS_390({
    // @ts-ignore
    modelValue: (modelForm.value.displayName), placeholder: "留空则使用模型 ID",
}));
const __VLS_392 = __VLS_391({
    modelValue: (modelForm.value.displayName),
    placeholder: "留空则使用模型 ID",
}, ...__VLS_functionalComponentArgsRest(__VLS_391));
__VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
let __VLS_395;
/** @ts-ignore @type { | typeof __VLS_components.ElSelect | typeof __VLS_components.ElSelect} */
ElSelect;
// @ts-ignore
const __VLS_396 = __VLS_asFunctionalComponent1(__VLS_395, new __VLS_395({
    // @ts-ignore
    modelValue: (modelForm.value.capability),
}));
const __VLS_397 = __VLS_396({
    modelValue: (modelForm.value.capability),
}, ...__VLS_functionalComponentArgsRest(__VLS_396));
const { default: __VLS_400 } = __VLS_nonNull(__VLS_398.slots);
let __VLS_401;
/** @ts-ignore @type { | typeof __VLS_components.ElOption} */
ElOption;
// @ts-ignore
const __VLS_402 = __VLS_asFunctionalComponent1(__VLS_401, new __VLS_401({
    // @ts-ignore
    label: "文本", value: "text",
}));
const __VLS_403 = __VLS_402({
    label: "文本",
    value: "text",
}, ...__VLS_functionalComponentArgsRest(__VLS_402));
let __VLS_406;
/** @ts-ignore @type { | typeof __VLS_components.ElOption} */
ElOption;
// @ts-ignore
const __VLS_407 = __VLS_asFunctionalComponent1(__VLS_406, new __VLS_406({
    // @ts-ignore
    label: "图片", value: "image",
}));
const __VLS_408 = __VLS_407({
    label: "图片",
    value: "image",
}, ...__VLS_functionalComponentArgsRest(__VLS_407));
let __VLS_411;
/** @ts-ignore @type { | typeof __VLS_components.ElOption} */
ElOption;
// @ts-ignore
const __VLS_412 = __VLS_asFunctionalComponent1(__VLS_411, new __VLS_411({
    // @ts-ignore
    label: "视频", value: "video",
}));
const __VLS_413 = __VLS_412({
    label: "视频",
    value: "video",
}, ...__VLS_functionalComponentArgsRest(__VLS_412));
let __VLS_416;
/** @ts-ignore @type { | typeof __VLS_components.ElOption} */
ElOption;
// @ts-ignore
const __VLS_417 = __VLS_asFunctionalComponent1(__VLS_416, new __VLS_416({
    // @ts-ignore
    label: "音频", value: "audio",
}));
const __VLS_418 = __VLS_417({
    label: "音频",
    value: "audio",
}, ...__VLS_functionalComponentArgsRest(__VLS_417));
// @ts-ignore
[modelDialogOpen, editingModelId, modelForm, modelForm, modelForm,];
var __VLS_398;
__VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
let __VLS_421;
/** @ts-ignore @type { | typeof __VLS_components.ElInput} */
ElInput;
// @ts-ignore
const __VLS_422 = __VLS_asFunctionalComponent1(__VLS_421, new __VLS_421({
    // @ts-ignore
    modelValue: (modelForm.value.sortOrder), modelModifiers: { number: true, }, type: "number", min: "0",
}));
const __VLS_423 = __VLS_422({
    modelValue: (modelForm.value.sortOrder),
    modelModifiers: { number: true, },
    type: "number",
    min: "0",
}, ...__VLS_functionalComponentArgsRest(__VLS_422));
__VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
    ...{ class: "channel-switch-row" },
});
/** @type {__VLS_StyleScopedClasses['channel-switch-row']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.small, __VLS_intrinsics.small)({});
let __VLS_426;
/** @ts-ignore @type { | typeof __VLS_components.ElSwitch} */
ElSwitch;
// @ts-ignore
const __VLS_427 = __VLS_asFunctionalComponent1(__VLS_426, new __VLS_426({
    // @ts-ignore
    modelValue: (modelForm.value.enabled),
}));
const __VLS_428 = __VLS_427({
    modelValue: (modelForm.value.enabled),
}, ...__VLS_functionalComponentArgsRest(__VLS_427));
{
    const { footer: __VLS_431 } = __VLS_nonNull(__VLS_382.slots);
    let __VLS_432;
    /** @ts-ignore @type { | typeof __VLS_components.ElButton | typeof __VLS_components.ElButton} */
    ElButton;
    // @ts-ignore
    const __VLS_433 = __VLS_asFunctionalComponent1(__VLS_432, new __VLS_432({
        // @ts-ignore
        ...{ 'onClick': {} },
    }));
    const __VLS_434 = __VLS_433({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_433));
    let __VLS_437;
    const __VLS_438 = {
        /** @type {typeof __VLS_437.click} */
        onClick: // @ts-ignore
        (...[$event]) => {
            void $event;
            return (modelDialogOpen.value = false);
            // @ts-ignore
            [modelDialogOpen, modelForm, modelForm,];
        },
    };
    void __VLS_438;
    const { default: __VLS_439 } = __VLS_nonNull(__VLS_435.slots);
    // @ts-ignore
    [];
    var __VLS_435;
    var __VLS_436;
    let __VLS_440;
    /** @ts-ignore @type { | typeof __VLS_components.ElButton | typeof __VLS_components.ElButton} */
    ElButton;
    // @ts-ignore
    const __VLS_441 = __VLS_asFunctionalComponent1(__VLS_440, new __VLS_440({
        // @ts-ignore
        ...{ 'onClick': {} }, type: "primary", loading: (__VLS_unwrap(saving, {})),
    }));
    const __VLS_442 = __VLS_441({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_unwrap(saving, {})),
    }, ...__VLS_functionalComponentArgsRest(__VLS_441));
    let __VLS_445;
    const __VLS_446 = {
        /** @type {typeof __VLS_445.click} */
        onClick: (saveModel),
    };
    void __VLS_446;
    const { default: __VLS_447 } = __VLS_nonNull(__VLS_443.slots);
    // @ts-ignore
    [saving,];
    var __VLS_443;
    var __VLS_444;
    // @ts-ignore
    [];
}
// @ts-ignore
[];
var __VLS_382;
// @ts-ignore
[];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
