import { computed, defineComponent, h, onMounted, ref } from "vue";
import { ElButton, ElInput, ElInputNumber, ElMessage } from "element-plus";
import "element-plus/dist/index.css";
import { LoaderCircle, Plus, RotateCcw, Save } from "@lucide/vue";
import * as pointApi from "@/services/points";
const MultiplierPanel = defineComponent({
    props: { title: { type: String, required: true }, values: { type: Object, required: true }, labels: { type: Object, required: true } },
    emits: ["change"],
    setup(props, { emit }) {
        return () => h("div", { class: "points-multiplier-panel" }, [h("strong", props.title), h("div", Object.keys(props.labels).map((key) => h("label", [h("span", props.labels[key]), h(ElInputNumber, { modelValue: props.values[key] ?? 1, min: 0, max: 1000000, precision: 2, "onUpdate:modelValue": (value) => emit("change", key, value) })])))]);
    },
});
const capabilities = [
    { value: "text", label: "文本" },
    { value: "image", label: "图片" },
    { value: "video", label: "视频" },
    { value: "audio", label: "音频" },
];
const loading = ref(true);
const saving = ref(false);
const config = ref(null);
const activeCapability = ref("image");
const customModel = ref("");
const groupedCounts = computed(() => Object.fromEntries(capabilities.map((capability) => [capability.value, config.value?.models.filter((model) => model.capability === capability.value).length || 0])));
const visibleModels = computed(() => config.value?.models.filter((model) => model.capability === activeCapability.value) || []);
const configuredCount = computed(() => config.value?.rules.length || 0);
onMounted(() => void loadRules());
async function loadRules() {
    loading.value = true;
    try {
        config.value = await pointApi.getPointRules();
    }
    catch (error) {
        ElMessage.error(messageOf(error, "积分规则加载失败"));
    }
    finally {
        loading.value = false;
    }
}
function modelCost(modelId) {
    return config.value?.rules.find((rule) => rule.modelId.toLowerCase() === modelId.toLowerCase())?.cost ?? config.value?.settings.defaultModelCost ?? 1;
}
function setModelCost(modelId, value) {
    if (!config.value || value === undefined)
        return;
    const existing = config.value.rules.find((rule) => rule.modelId.toLowerCase() === modelId.toLowerCase());
    if (existing)
        existing.cost = value;
    else
        config.value.rules.push({ modelId, cost: value });
}
function resetModelCost(modelId) {
    if (!config.value)
        return;
    config.value.rules = config.value.rules.filter((rule) => rule.modelId.toLowerCase() !== modelId.toLowerCase());
}
function addCustomModel() {
    if (!config.value)
        return;
    const modelId = customModel.value.trim();
    if (!modelId)
        return ElMessage.warning("请输入模型 ID");
    if (!config.value.models.some((model) => model.modelId.toLowerCase() === modelId.toLowerCase()))
        config.value.models.push({ modelId, displayName: modelId, capability: activeCapability.value });
    setModelCost(modelId, config.value.settings.defaultModelCost);
    customModel.value = "";
}
async function saveRules() {
    if (!config.value)
        return;
    saving.value = true;
    try {
        config.value = await pointApi.savePointRules(config.value);
        ElMessage.success("积分规则已保存");
    }
    catch (error) {
        ElMessage.error(messageOf(error, "积分规则保存失败"));
    }
    finally {
        saving.value = false;
    }
}
function updateMultiplier(group, key, value) {
    if (!config.value || value === undefined)
        return;
    config.value.settings[group][key] = value;
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
__VLS_withDotValue(loading, {});
// @ts-ignore
__VLS_withDotValue(config, {});
// @ts-ignore
__VLS_withDotValue(activeCapability, {});
// @ts-ignore
__VLS_withDotValue(groupedCounts, {});
// @ts-ignore
__VLS_withDotValue(visibleModels, {});
// @ts-ignore
__VLS_withDotValue(capabilities, {});
__VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
    ...{ class: "points-workspace" },
});
/** @type {__VLS_StyleScopedClasses['points-workspace']} */ ;
if (loading.value) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "points-loading" },
    });
    /** @type {__VLS_StyleScopedClasses['points-loading']} */ ;
    let __VLS_0;
    /** @ts-ignore @type { | typeof __VLS_components.LoaderCircle} */
    LoaderCircle;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
        // @ts-ignore
        ...{ class: "spin" }, size: (22),
    }));
    const __VLS_2 = __VLS_1({
        ...{ class: "spin" },
        size: (22),
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    /** @type {__VLS_StyleScopedClasses['spin']} */ ;
}
else if (config.value) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "points-metrics" },
    });
    /** @type {__VLS_StyleScopedClasses['points-metrics']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
    (config.value.settings.initialPoints);
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
    (config.value.settings.defaultModelCost);
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
    (__VLS_unwrap(configuredCount, {}));
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
    (config.value.models.length);
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "points-actions" },
    });
    /** @type {__VLS_StyleScopedClasses['points-actions']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    let __VLS_5;
    /** @ts-ignore @type { | typeof __VLS_components.ElButton | typeof __VLS_components.ElButton} */
    ElButton;
    // @ts-ignore
    const __VLS_6 = __VLS_asFunctionalComponent1(__VLS_5, new __VLS_5({
        // @ts-ignore
        ...{ 'onClick': {} }, type: "primary", loading: (__VLS_unwrap(saving, {})),
    }));
    const __VLS_7 = __VLS_6({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_unwrap(saving, {})),
    }, ...__VLS_functionalComponentArgsRest(__VLS_6));
    let __VLS_10;
    const __VLS_11 = {
        /** @type {typeof __VLS_10.click} */
        onClick: (saveRules),
    };
    void __VLS_11;
    const { default: __VLS_12 } = __VLS_nonNull(__VLS_8.slots);
    let __VLS_13;
    /** @ts-ignore @type { | typeof __VLS_components.Save} */
    Save;
    // @ts-ignore
    const __VLS_14 = __VLS_asFunctionalComponent1(__VLS_13, new __VLS_13({
        // @ts-ignore
        size: (15),
    }));
    const __VLS_15 = __VLS_14({
        size: (15),
    }, ...__VLS_functionalComponentArgsRest(__VLS_14));
    // @ts-ignore
    [loading, config, config, config, config, configuredCount, saving,];
    var __VLS_8;
    var __VLS_9;
    __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
        ...{ class: "points-section" },
    });
    /** @type {__VLS_StyleScopedClasses['points-section']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "points-section-heading" },
    });
    /** @type {__VLS_StyleScopedClasses['points-section-heading']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "points-base-grid" },
    });
    /** @type {__VLS_StyleScopedClasses['points-base-grid']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    let __VLS_18;
    /** @ts-ignore @type { | typeof __VLS_components.ElInputNumber} */
    ElInputNumber;
    // @ts-ignore
    const __VLS_19 = __VLS_asFunctionalComponent1(__VLS_18, new __VLS_18({
        // @ts-ignore
        modelValue: (config.value.settings.initialPoints), min: (0), max: (1000000), precision: (2),
    }));
    const __VLS_20 = __VLS_19({
        modelValue: (config.value.settings.initialPoints),
        min: (0),
        max: (1000000),
        precision: (2),
    }, ...__VLS_functionalComponentArgsRest(__VLS_19));
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    let __VLS_23;
    /** @ts-ignore @type { | typeof __VLS_components.ElInputNumber} */
    ElInputNumber;
    // @ts-ignore
    const __VLS_24 = __VLS_asFunctionalComponent1(__VLS_23, new __VLS_23({
        // @ts-ignore
        modelValue: (config.value.settings.defaultModelCost), min: (0), max: (1000000), precision: (2),
    }));
    const __VLS_25 = __VLS_24({
        modelValue: (config.value.settings.defaultModelCost),
        min: (0),
        max: (1000000),
        precision: (2),
    }, ...__VLS_functionalComponentArgsRest(__VLS_24));
    __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
        ...{ class: "points-section" },
    });
    /** @type {__VLS_StyleScopedClasses['points-section']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "points-section-heading" },
    });
    /** @type {__VLS_StyleScopedClasses['points-section-heading']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "points-custom-model" },
    });
    /** @type {__VLS_StyleScopedClasses['points-custom-model']} */ ;
    let __VLS_28;
    /** @ts-ignore @type { | typeof __VLS_components.ElInput} */
    ElInput;
    // @ts-ignore
    const __VLS_29 = __VLS_asFunctionalComponent1(__VLS_28, new __VLS_28({
        // @ts-ignore
        ...{ 'onKeyup': {} }, modelValue: (__VLS_unwrap(customModel, {})), placeholder: "手工模型 ID",
    }));
    const __VLS_30 = __VLS_29({
        ...{ 'onKeyup': {} },
        modelValue: (__VLS_unwrap(customModel, {})),
        placeholder: "手工模型 ID",
    }, ...__VLS_functionalComponentArgsRest(__VLS_29));
    let __VLS_33;
    const __VLS_34 = {
        /** @type {typeof __VLS_33.keyup} */
        onKeyup: (addCustomModel),
    };
    void __VLS_34;
    var __VLS_31;
    var __VLS_32;
    let __VLS_35;
    /** @ts-ignore @type { | typeof __VLS_components.ElButton | typeof __VLS_components.ElButton} */
    ElButton;
    // @ts-ignore
    const __VLS_36 = __VLS_asFunctionalComponent1(__VLS_35, new __VLS_35({
        // @ts-ignore
        ...{ 'onClick': {} },
    }));
    const __VLS_37 = __VLS_36({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_36));
    let __VLS_40;
    const __VLS_41 = {
        /** @type {typeof __VLS_40.click} */
        onClick: (addCustomModel),
    };
    void __VLS_41;
    const { default: __VLS_42 } = __VLS_nonNull(__VLS_38.slots);
    let __VLS_43;
    /** @ts-ignore @type { | typeof __VLS_components.Plus} */
    Plus;
    // @ts-ignore
    const __VLS_44 = __VLS_asFunctionalComponent1(__VLS_43, new __VLS_43({
        // @ts-ignore
        size: (14),
    }));
    const __VLS_45 = __VLS_44({
        size: (14),
    }, ...__VLS_functionalComponentArgsRest(__VLS_44));
    // @ts-ignore
    [config, config, customModel,];
    var __VLS_38;
    var __VLS_39;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "points-capability-tabs" },
    });
    /** @type {__VLS_StyleScopedClasses['points-capability-tabs']} */ ;
    const __VLS_48 = __VLS_tryAsConstant((capabilities.value));
    for (const [capability] of __VLS_vFor(__VLS_nonNull(__VLS_48))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: // @ts-ignore
                (...[$event]) => {
                    void $event;
                    if (!!(loading.value))
                        throw 0;
                    if (!(config.value))
                        throw 0;
                    return (activeCapability.value = capability.value);
                    // @ts-ignore
                    [capabilities, activeCapability,];
                } },
            key: (capability.value),
            type: "button",
            ...{ class: ({ 'is-active': activeCapability.value === capability.value }) },
        });
        /** @type {__VLS_StyleScopedClasses['is-active']} */ ;
        (capability.label);
        (groupedCounts.value[capability.value]);
        // @ts-ignore
        [activeCapability, groupedCounts,];
    }
    if (visibleModels.value.length) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "points-model-grid" },
        });
        /** @type {__VLS_StyleScopedClasses['points-model-grid']} */ ;
        const __VLS_49 = __VLS_tryAsConstant((visibleModels.value));
        for (const [model] of __VLS_vFor(__VLS_nonNull(__VLS_49))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                key: (model.modelId),
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
            (model.displayName);
            __VLS_asFunctionalElement1(__VLS_intrinsics.small, __VLS_intrinsics.small)({});
            (model.modelId);
            (model.capability === "video" ? "每秒积分" : "每次积分");
            let __VLS_50;
            /** @ts-ignore @type { | typeof __VLS_components.ElInputNumber} */
            ElInputNumber;
            // @ts-ignore
            const __VLS_51 = __VLS_asFunctionalComponent1(__VLS_50, new __VLS_50({
                // @ts-ignore
                ...{ 'onUpdate:modelValue': {} }, modelValue: (modelCost(model.modelId)), min: (0), max: (1000000), precision: (2),
            }));
            const __VLS_52 = __VLS_51({
                ...{ 'onUpdate:modelValue': {} },
                modelValue: (modelCost(model.modelId)),
                min: (0),
                max: (1000000),
                precision: (2),
            }, ...__VLS_functionalComponentArgsRest(__VLS_51));
            let __VLS_55;
            const __VLS_56 = {
                /** @type {typeof __VLS_55.'update:modelValue'} */
                'onUpdate:modelValue': // @ts-ignore
                (...[$event]) => {
                    void $event;
                    if (!!(loading.value))
                        throw 0;
                    if (!(config.value))
                        throw 0;
                    if (!(visibleModels.value.length))
                        throw 0;
                    return (setModelCost(model.modelId, $event));
                    // @ts-ignore
                    [visibleModels, visibleModels,];
                },
            };
            void __VLS_56;
            var __VLS_53;
            var __VLS_54;
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: // @ts-ignore
                    (...[$event]) => {
                        void $event;
                        if (!!(loading.value))
                            throw 0;
                        if (!(config.value))
                            throw 0;
                        if (!(visibleModels.value.length))
                            throw 0;
                        return (resetModelCost(model.modelId));
                        // @ts-ignore
                        [];
                    } },
                type: "button",
                title: "恢复默认成本",
                disabled: (!config.value.rules.some((rule) => rule.modelId.toLowerCase() === model.modelId.toLowerCase())),
            });
            let __VLS_57;
            /** @ts-ignore @type { | typeof __VLS_components.RotateCcw} */
            RotateCcw;
            // @ts-ignore
            const __VLS_58 = __VLS_asFunctionalComponent1(__VLS_57, new __VLS_57({
                // @ts-ignore
                size: (14),
            }));
            const __VLS_59 = __VLS_58({
                size: (14),
            }, ...__VLS_functionalComponentArgsRest(__VLS_58));
            // @ts-ignore
            [config,];
        }
    }
    else {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "points-empty" },
        });
        /** @type {__VLS_StyleScopedClasses['points-empty']} */ ;
        (capabilities.value.find((item) => item.value === activeCapability.value)?.label);
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
        ...{ class: "points-section" },
    });
    /** @type {__VLS_StyleScopedClasses['points-section']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "points-section-heading" },
    });
    /** @type {__VLS_StyleScopedClasses['points-section-heading']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "points-multiplier-grid" },
    });
    /** @type {__VLS_StyleScopedClasses['points-multiplier-grid']} */ ;
    let __VLS_62;
    /** @ts-ignore @type { | typeof __VLS_components.MultiplierPanel} */
    MultiplierPanel;
    // @ts-ignore
    const __VLS_63 = __VLS_asFunctionalComponent1(__VLS_62, new __VLS_62({
        // @ts-ignore
        ...{ 'onChange': {} }, title: "图片清晰度", values: (config.value.settings.imageQualityMultipliers), labels: ({ '1K': '1K', '2K': '2K' }),
    }));
    const __VLS_64 = __VLS_63({
        ...{ 'onChange': {} },
        title: "图片清晰度",
        values: (config.value.settings.imageQualityMultipliers),
        labels: ({ '1K': '1K', '2K': '2K' }),
    }, ...__VLS_functionalComponentArgsRest(__VLS_63));
    let __VLS_67;
    const __VLS_68 = {
        /** @type {typeof __VLS_67.change} */
        onChange: ((key, value) => updateMultiplier('imageQualityMultipliers', key, value)),
    };
    void __VLS_68;
    var __VLS_65;
    var __VLS_66;
    let __VLS_69;
    /** @ts-ignore @type { | typeof __VLS_components.MultiplierPanel} */
    MultiplierPanel;
    // @ts-ignore
    const __VLS_70 = __VLS_asFunctionalComponent1(__VLS_69, new __VLS_69({
        // @ts-ignore
        ...{ 'onChange': {} }, title: "视频清晰度", values: (config.value.settings.videoQualityMultipliers), labels: ({ '480P': '480P', '768P': '768P', '1080P': '1080P', '2K': '2K', '4K': '4K' }),
    }));
    const __VLS_71 = __VLS_70({
        ...{ 'onChange': {} },
        title: "视频清晰度",
        values: (config.value.settings.videoQualityMultipliers),
        labels: ({ '480P': '480P', '768P': '768P', '1080P': '1080P', '2K': '2K', '4K': '4K' }),
    }, ...__VLS_functionalComponentArgsRest(__VLS_70));
    let __VLS_74;
    const __VLS_75 = {
        /** @type {typeof __VLS_74.change} */
        onChange: ((key, value) => updateMultiplier('videoQualityMultipliers', key, value)),
    };
    void __VLS_75;
    var __VLS_72;
    var __VLS_73;
}
// @ts-ignore
[config, config, capabilities, activeCapability,];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
