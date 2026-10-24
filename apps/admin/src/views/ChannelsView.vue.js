import { computed, onMounted, reactive, ref } from "vue";
import { ElButton, ElDialog, ElInput, ElMessage, ElMessageBox, ElOption, ElSelect, ElSwitch } from "element-plus";
import { CheckCircle2, CircleAlert, KeyRound, LoaderCircle, Pencil, Plus, RefreshCw, Search, Trash2, XCircle } from "@lucide/vue";
import * as channelApi from "@/services/channels";
const channels = ref([]);
const loading = ref(true);
const saving = ref(false);
const testingId = ref("");
const syncingId = ref("");
const query = ref("");
const status = ref("all");
const dialogOpen = ref(false);
const editingId = ref("");
const modelDialogOpen = ref(false);
const editingModelId = ref("");
const channelForm = reactive({ name: "", baseUrl: "", protocol: "openai", apiKey: "", enabled: false });
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
onMounted(() => void loadChannels());
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
    Object.assign(channelForm, { name: "", baseUrl: "", protocol: "openai", apiKey: "", enabled: false });
    dialogOpen.value = true;
}
function openEdit(channel) {
    editingId.value = channel.id;
    Object.assign(channelForm, { name: channel.name, baseUrl: channel.baseUrl, protocol: channel.protocol, apiKey: "", enabled: channel.enabled });
    dialogOpen.value = true;
}
async function saveChannel() {
    if (!channelForm.name.trim() || !channelForm.baseUrl.trim())
        return ElMessage.warning("请填写渠道名称和 Base URL");
    if (!editingId.value && !channelForm.apiKey?.trim())
        return ElMessage.warning("新渠道必须填写 API Key");
    saving.value = true;
    try {
        const saved = editingId.value ? await channelApi.updateChannel(editingId.value, channelForm) : await channelApi.createChannel(channelForm);
        editingId.value = saved.id;
        channelForm.apiKey = "";
        await loadChannels();
        ElMessage.success(editingId.value ? "渠道配置已保存" : "渠道已创建");
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
        await channelApi.updateChannel(channel.id, { name: channel.name, baseUrl: channel.baseUrl, protocol: channel.protocol, enabled });
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
        capability: "image",
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
__VLS_withDotValue(loading, {});
// @ts-ignore
__VLS_withDotValue(filteredChannels, {});
// @ts-ignore
__VLS_withDotValue(testingId, {});
// @ts-ignore
__VLS_withDotValue(syncingId, {});
// @ts-ignore
__VLS_withDotValue(editingId, {});
// @ts-ignore
__VLS_withDotValue(channelForm, {});
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
__VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
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
                    [enabledCount, channels, modelCount, enabledModelCount, query, status, loading, filteredChannels, filteredChannels,];
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
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
        (channel.baseUrl);
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
        (channel.models.filter((model) => model.enabled).length);
        (channel.models.length);
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
        (channel.models.map((model) => model.displayName).join("、") || "尚未添加模型");
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
                    [];
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
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.dt, __VLS_intrinsics.dt)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.dd, __VLS_intrinsics.dd)({});
        (channel.models.filter((model) => model.enabled).length);
        (channel.models.length);
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({});
        (channel.models.map((model) => model.displayName).join("、") || "尚未添加模型");
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
                    [];
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
    modelValue: (dialogOpen.value), title: (editingId.value ? '编辑模型渠道' : '接入模型渠道'), width: "min(720px, calc(100vw - 28px))", destroyOnClose: true,
}));
const __VLS_133 = __VLS_132({
    modelValue: (dialogOpen.value),
    title: (editingId.value ? '编辑模型渠道' : '接入模型渠道'),
    width: "min(720px, calc(100vw - 28px))",
    destroyOnClose: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_132));
const { default: __VLS_136 } = __VLS_nonNull(__VLS_134.slots);
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "channel-form-grid" },
});
/** @type {__VLS_StyleScopedClasses['channel-form-grid']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
let __VLS_137;
/** @ts-ignore @type { | typeof __VLS_components.ElInput} */
ElInput;
// @ts-ignore
const __VLS_138 = __VLS_asFunctionalComponent1(__VLS_137, new __VLS_137({
    // @ts-ignore
    modelValue: (channelForm.value.name), placeholder: "例如：生产图片渠道",
}));
const __VLS_139 = __VLS_138({
    modelValue: (channelForm.value.name),
    placeholder: "例如：生产图片渠道",
}, ...__VLS_functionalComponentArgsRest(__VLS_138));
__VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
let __VLS_142;
/** @ts-ignore @type { | typeof __VLS_components.ElSelect | typeof __VLS_components.ElSelect} */
ElSelect;
// @ts-ignore
const __VLS_143 = __VLS_asFunctionalComponent1(__VLS_142, new __VLS_142({
    // @ts-ignore
    modelValue: (channelForm.value.protocol), disabled: true,
}));
const __VLS_144 = __VLS_143({
    modelValue: (channelForm.value.protocol),
    disabled: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_143));
const { default: __VLS_147 } = __VLS_nonNull(__VLS_145.slots);
let __VLS_148;
/** @ts-ignore @type { | typeof __VLS_components.ElOption} */
ElOption;
// @ts-ignore
const __VLS_149 = __VLS_asFunctionalComponent1(__VLS_148, new __VLS_148({
    // @ts-ignore
    label: "OpenAI 图片生成", value: "openai",
}));
const __VLS_150 = __VLS_149({
    label: "OpenAI 图片生成",
    value: "openai",
}, ...__VLS_functionalComponentArgsRest(__VLS_149));
// @ts-ignore
[channels, channels, loading, filteredChannels, dialogOpen, editingId, channelForm, channelForm,];
var __VLS_145;
__VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
    ...{ class: "channel-form-wide" },
});
/** @type {__VLS_StyleScopedClasses['channel-form-wide']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
let __VLS_153;
/** @ts-ignore @type { | typeof __VLS_components.ElInput} */
ElInput;
// @ts-ignore
const __VLS_154 = __VLS_asFunctionalComponent1(__VLS_153, new __VLS_153({
    // @ts-ignore
    modelValue: (channelForm.value.baseUrl), placeholder: "https:/*api.example.com/v1", *() { }
} / ));
;
const __VLS_155 = __VLS_154({
    modelValue: (channelForm.value.baseUrl),
    placeholder: "https://api.example.com/v1",
}, ...__VLS_functionalComponentArgsRest(__VLS_154));
__VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
    ...{ class: "channel-form-wide" },
});
/** @type {__VLS_StyleScopedClasses['channel-form-wide']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
let __VLS_158;
/** @ts-ignore @type { | typeof __VLS_components.ElInput} */
ElInput;
// @ts-ignore
const __VLS_159 = __VLS_asFunctionalComponent1(__VLS_158, new __VLS_158({
    // @ts-ignore
    modelValue: (channelForm.value.apiKey), type: "password", showPassword: true, placeholder: (editingChannel.value?.hasApiKey ? `已保存 ${editingChannel.value.apiKeyMasked}，留空保持不变` : '输入 API Key'),
}));
const __VLS_160 = __VLS_159({
    modelValue: (channelForm.value.apiKey),
    type: "password",
    showPassword: true,
    placeholder: (editingChannel.value?.hasApiKey ? `已保存 ${editingChannel.value.apiKeyMasked}，留空保持不变` : '输入 API Key'),
}, ...__VLS_functionalComponentArgsRest(__VLS_159));
__VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
    ...{ class: "channel-switch-row" },
});
/** @type {__VLS_StyleScopedClasses['channel-switch-row']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.small, __VLS_intrinsics.small)({});
let __VLS_163;
/** @ts-ignore @type { | typeof __VLS_components.ElSwitch} */
ElSwitch;
// @ts-ignore
const __VLS_164 = __VLS_asFunctionalComponent1(__VLS_163, new __VLS_163({
    // @ts-ignore
    modelValue: (channelForm.value.enabled),
}));
const __VLS_165 = __VLS_164({
    modelValue: (channelForm.value.enabled),
}, ...__VLS_functionalComponentArgsRest(__VLS_164));
if (editingChannel.value) {
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
    let __VLS_168;
    /** @ts-ignore @type { | typeof __VLS_components.ElButton | typeof __VLS_components.ElButton} */
    ElButton;
    // @ts-ignore
    const __VLS_169 = __VLS_asFunctionalComponent1(__VLS_168, new __VLS_168({
        // @ts-ignore
        ...{ 'onClick': {} }, loading: (syncingId.value === editingChannel.value.id),
    }));
    const __VLS_170 = __VLS_169({
        ...{ 'onClick': {} },
        loading: (syncingId.value === editingChannel.value.id),
    }, ...__VLS_functionalComponentArgsRest(__VLS_169));
    let __VLS_173;
    const __VLS_174 = {
        /** @type {typeof __VLS_173.click} */
        onClick: // @ts-ignore
        (...[$event]) => {
            void $event;
            if (!(editingChannel.value))
                throw 0;
            return (syncModels(editingChannel.value));
            // @ts-ignore
            [syncingId, channelForm, channelForm, channelForm, editingChannel, editingChannel, editingChannel, editingChannel, editingChannel,];
        },
    };
    void __VLS_174;
    const { default: __VLS_175 } = __VLS_nonNull(__VLS_171.slots);
    let __VLS_176;
    /** @ts-ignore @type { | typeof __VLS_components.RefreshCw} */
    RefreshCw;
    // @ts-ignore
    const __VLS_177 = __VLS_asFunctionalComponent1(__VLS_176, new __VLS_176({
        // @ts-ignore
        size: (14),
    }));
    const __VLS_178 = __VLS_177({
        size: (14),
    }, ...__VLS_functionalComponentArgsRest(__VLS_177));
    // @ts-ignore
    [];
    var __VLS_171;
    var __VLS_172;
    let __VLS_181;
    /** @ts-ignore @type { | typeof __VLS_components.ElButton | typeof __VLS_components.ElButton} */
    ElButton;
    // @ts-ignore
    const __VLS_182 = __VLS_asFunctionalComponent1(__VLS_181, new __VLS_181({
        // @ts-ignore
        ...{ 'onClick': {} }, type: "primary",
    }));
    const __VLS_183 = __VLS_182({
        ...{ 'onClick': {} },
        type: "primary",
    }, ...__VLS_functionalComponentArgsRest(__VLS_182));
    let __VLS_186;
    const __VLS_187 = {
        /** @type {typeof __VLS_186.click} */
        onClick: // @ts-ignore
        (...[$event]) => {
            void $event;
            if (!(editingChannel.value))
                throw 0;
            return (openModel());
            // @ts-ignore
            [];
        },
    };
    void __VLS_187;
    const { default: __VLS_188 } = __VLS_nonNull(__VLS_184.slots);
    let __VLS_189;
    /** @ts-ignore @type { | typeof __VLS_components.Plus} */
    Plus;
    // @ts-ignore
    const __VLS_190 = __VLS_asFunctionalComponent1(__VLS_189, new __VLS_189({
        // @ts-ignore
        size: (14),
    }));
    const __VLS_191 = __VLS_190({
        size: (14),
    }, ...__VLS_functionalComponentArgsRest(__VLS_190));
    // @ts-ignore
    [];
    var __VLS_184;
    var __VLS_185;
    if (editingChannel.value.models.length) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "channel-model-list" },
        });
        /** @type {__VLS_StyleScopedClasses['channel-model-list']} */ ;
        const __VLS_194 = __VLS_tryAsConstant((editingChannel.value.models));
        for (const [model] of __VLS_vFor(__VLS_nonNull(__VLS_194))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                key: (model.id),
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
            (model.displayName);
            __VLS_asFunctionalElement1(__VLS_intrinsics.small, __VLS_intrinsics.small)({});
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
                        if (!(editingChannel.value))
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
            let __VLS_195;
            /** @ts-ignore @type { | typeof __VLS_components.Pencil} */
            Pencil;
            // @ts-ignore
            const __VLS_196 = __VLS_asFunctionalComponent1(__VLS_195, new __VLS_195({
                // @ts-ignore
                size: (14),
            }));
            const __VLS_197 = __VLS_196({
                size: (14),
            }, ...__VLS_functionalComponentArgsRest(__VLS_196));
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: // @ts-ignore
                    (...[$event]) => {
                        void $event;
                        if (!(editingChannel.value))
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
            let __VLS_200;
            /** @ts-ignore @type { | typeof __VLS_components.Trash2} */
            Trash2;
            // @ts-ignore
            const __VLS_201 = __VLS_asFunctionalComponent1(__VLS_200, new __VLS_200({
                // @ts-ignore
                size: (14),
            }));
            const __VLS_202 = __VLS_201({
                size: (14),
            }, ...__VLS_functionalComponentArgsRest(__VLS_201));
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
    const { footer: __VLS_205 } = __VLS_nonNull(__VLS_134.slots);
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "channel-dialog-footer" },
    });
    /** @type {__VLS_StyleScopedClasses['channel-dialog-footer']} */ ;
    if (editingChannel.value) {
        let __VLS_206;
        /** @ts-ignore @type { | typeof __VLS_components.ElButton | typeof __VLS_components.ElButton} */
        ElButton;
        // @ts-ignore
        const __VLS_207 = __VLS_asFunctionalComponent1(__VLS_206, new __VLS_206({
            // @ts-ignore
            ...{ 'onClick': {} }, type: "danger", plain: true,
        }));
        const __VLS_208 = __VLS_207({
            ...{ 'onClick': {} },
            type: "danger",
            plain: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_207));
        let __VLS_211;
        const __VLS_212 = {
            /** @type {typeof __VLS_211.click} */
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
        void __VLS_212;
        const { default: __VLS_213 } = __VLS_nonNull(__VLS_209.slots);
        let __VLS_214;
        /** @ts-ignore @type { | typeof __VLS_components.Trash2} */
        Trash2;
        // @ts-ignore
        const __VLS_215 = __VLS_asFunctionalComponent1(__VLS_214, new __VLS_214({
            // @ts-ignore
            size: (14),
        }));
        const __VLS_216 = __VLS_215({
            size: (14),
        }, ...__VLS_functionalComponentArgsRest(__VLS_215));
        // @ts-ignore
        [];
        var __VLS_209;
        var __VLS_210;
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.span)({});
    let __VLS_219;
    /** @ts-ignore @type { | typeof __VLS_components.ElButton | typeof __VLS_components.ElButton} */
    ElButton;
    // @ts-ignore
    const __VLS_220 = __VLS_asFunctionalComponent1(__VLS_219, new __VLS_219({
        // @ts-ignore
        ...{ 'onClick': {} },
    }));
    const __VLS_221 = __VLS_220({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_220));
    let __VLS_224;
    const __VLS_225 = {
        /** @type {typeof __VLS_224.click} */
        onClick: // @ts-ignore
        (...[$event]) => {
            void $event;
            return (dialogOpen.value = false);
            // @ts-ignore
            [dialogOpen,];
        },
    };
    void __VLS_225;
    const { default: __VLS_226 } = __VLS_nonNull(__VLS_222.slots);
    // @ts-ignore
    [];
    var __VLS_222;
    var __VLS_223;
    let __VLS_227;
    /** @ts-ignore @type { | typeof __VLS_components.ElButton | typeof __VLS_components.ElButton} */
    ElButton;
    // @ts-ignore
    const __VLS_228 = __VLS_asFunctionalComponent1(__VLS_227, new __VLS_227({
        // @ts-ignore
        ...{ 'onClick': {} }, type: "primary", loading: (__VLS_unwrap(saving, {})),
    }));
    const __VLS_229 = __VLS_228({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_unwrap(saving, {})),
    }, ...__VLS_functionalComponentArgsRest(__VLS_228));
    let __VLS_232;
    const __VLS_233 = {
        /** @type {typeof __VLS_232.click} */
        onClick: (saveChannel),
    };
    void __VLS_233;
    const { default: __VLS_234 } = __VLS_nonNull(__VLS_230.slots);
    // @ts-ignore
    [saving,];
    var __VLS_230;
    var __VLS_231;
    // @ts-ignore
    [];
}
// @ts-ignore
[];
var __VLS_134;
let __VLS_235;
/** @ts-ignore @type { | typeof __VLS_components.ElDialog | typeof __VLS_components.ElDialog} */
ElDialog;
// @ts-ignore
const __VLS_236 = __VLS_asFunctionalComponent1(__VLS_235, new __VLS_235({
    // @ts-ignore
    modelValue: (modelDialogOpen.value), title: (editingModelId.value ? '编辑图片模型' : '添加图片模型'), width: "min(520px, calc(100vw - 28px))", appendToBody: true,
}));
const __VLS_237 = __VLS_236({
    modelValue: (modelDialogOpen.value),
    title: (editingModelId.value ? '编辑图片模型' : '添加图片模型'),
    width: "min(520px, calc(100vw - 28px))",
    appendToBody: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_236));
const { default: __VLS_240 } = __VLS_nonNull(__VLS_238.slots);
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "channel-form-grid" },
});
/** @type {__VLS_StyleScopedClasses['channel-form-grid']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
let __VLS_241;
/** @ts-ignore @type { | typeof __VLS_components.ElInput} */
ElInput;
// @ts-ignore
const __VLS_242 = __VLS_asFunctionalComponent1(__VLS_241, new __VLS_241({
    // @ts-ignore
    modelValue: (modelForm.value.modelId), placeholder: "gpt-image-2",
}));
const __VLS_243 = __VLS_242({
    modelValue: (modelForm.value.modelId),
    placeholder: "gpt-image-2",
}, ...__VLS_functionalComponentArgsRest(__VLS_242));
__VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
let __VLS_246;
/** @ts-ignore @type { | typeof __VLS_components.ElInput} */
ElInput;
// @ts-ignore
const __VLS_247 = __VLS_asFunctionalComponent1(__VLS_246, new __VLS_246({
    // @ts-ignore
    modelValue: (modelForm.value.displayName), placeholder: "留空则使用模型 ID",
}));
const __VLS_248 = __VLS_247({
    modelValue: (modelForm.value.displayName),
    placeholder: "留空则使用模型 ID",
}, ...__VLS_functionalComponentArgsRest(__VLS_247));
__VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
let __VLS_251;
/** @ts-ignore @type { | typeof __VLS_components.ElInput} */
ElInput;
// @ts-ignore
const __VLS_252 = __VLS_asFunctionalComponent1(__VLS_251, new __VLS_251({
    // @ts-ignore
    modelValue: (modelForm.value.sortOrder), modelModifiers: { number: true, }, type: "number", min: "0",
}));
const __VLS_253 = __VLS_252({
    modelValue: (modelForm.value.sortOrder),
    modelModifiers: { number: true, },
    type: "number",
    min: "0",
}, ...__VLS_functionalComponentArgsRest(__VLS_252));
__VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
    ...{ class: "channel-switch-row" },
});
/** @type {__VLS_StyleScopedClasses['channel-switch-row']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.small, __VLS_intrinsics.small)({});
let __VLS_256;
/** @ts-ignore @type { | typeof __VLS_components.ElSwitch} */
ElSwitch;
// @ts-ignore
const __VLS_257 = __VLS_asFunctionalComponent1(__VLS_256, new __VLS_256({
    // @ts-ignore
    modelValue: (modelForm.value.enabled),
}));
const __VLS_258 = __VLS_257({
    modelValue: (modelForm.value.enabled),
}, ...__VLS_functionalComponentArgsRest(__VLS_257));
{
    const { footer: __VLS_261 } = __VLS_nonNull(__VLS_238.slots);
    let __VLS_262;
    /** @ts-ignore @type { | typeof __VLS_components.ElButton | typeof __VLS_components.ElButton} */
    ElButton;
    // @ts-ignore
    const __VLS_263 = __VLS_asFunctionalComponent1(__VLS_262, new __VLS_262({
        // @ts-ignore
        ...{ 'onClick': {} },
    }));
    const __VLS_264 = __VLS_263({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_263));
    let __VLS_267;
    const __VLS_268 = {
        /** @type {typeof __VLS_267.click} */
        onClick: // @ts-ignore
        (...[$event]) => {
            void $event;
            return (modelDialogOpen.value = false);
            // @ts-ignore
            [modelDialogOpen, modelDialogOpen, editingModelId, modelForm, modelForm, modelForm, modelForm,];
        },
    };
    void __VLS_268;
    const { default: __VLS_269 } = __VLS_nonNull(__VLS_265.slots);
    // @ts-ignore
    [];
    var __VLS_265;
    var __VLS_266;
    let __VLS_270;
    /** @ts-ignore @type { | typeof __VLS_components.ElButton | typeof __VLS_components.ElButton} */
    ElButton;
    // @ts-ignore
    const __VLS_271 = __VLS_asFunctionalComponent1(__VLS_270, new __VLS_270({
        // @ts-ignore
        ...{ 'onClick': {} }, type: "primary", loading: (__VLS_unwrap(saving, {})),
    }));
    const __VLS_272 = __VLS_271({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_unwrap(saving, {})),
    }, ...__VLS_functionalComponentArgsRest(__VLS_271));
    let __VLS_275;
    const __VLS_276 = {
        /** @type {typeof __VLS_275.click} */
        onClick: (saveModel),
    };
    void __VLS_276;
    const { default: __VLS_277 } = __VLS_nonNull(__VLS_273.slots);
    // @ts-ignore
    [saving,];
    var __VLS_273;
    var __VLS_274;
    // @ts-ignore
    [];
}
// @ts-ignore
[];
var __VLS_238;
// @ts-ignore
[];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
