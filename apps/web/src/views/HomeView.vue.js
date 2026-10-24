import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { ElMessage } from "element-plus";
import { ArrowRight, Bell, Clock3, Image, LoaderCircle, Moon, Paperclip, Play, Sparkles, Sun, Video, } from "@lucide/vue";
import { useAuthStore } from "@/stores/auth";
import * as assetApi from "@/services/assets";
import { createImageGeneration, } from "@/services/generation";
import { apiErrorMessage } from "@/services/http";
const authStore = useAuthStore();
const router = useRouter();
const creationTypes = [
    { id: "image", label: "图片生成", icon: Image },
    { id: "video", label: "视频生成", icon: Video },
];
const defaultCapabilities = {
    image: {
        enabled: true,
        models: [{ value: "gpt-image-2", label: "gpt-image-2" }],
        sizes: [
            { value: "1:1", label: "1:1", width: 2048, height: 2048 },
            { value: "16:9", label: "16:9", width: 2048, height: 1152 },
            { value: "9:16", label: "9:16", width: 1152, height: 2048 },
            { value: "4:3", label: "4:3", width: 2048, height: 1536 },
            { value: "3:4", label: "3:4", width: 1536, height: 2048 },
        ],
        qualities: [{ value: "1K", label: "1K" }, { value: "2K", label: "2K" }],
    },
    video: { enabled: false, models: [], sizes: [], qualities: [] },
};
const activeType = ref("image");
const prompt = ref("");
const capabilities = ref(defaultCapabilities);
const selectedModel = ref("gpt-image-2");
const selectedSize = ref("16:9");
const selectedQuality = ref("2K");
const darkMode = ref(false);
const creating = ref(false);
const recentLoading = ref(true);
const recentWorks = ref([]);
const recentPreviewUrls = ref({});
const currentCapability = computed(() => capabilities.value[activeType.value]);
const promptPlaceholder = computed(() => {
    const labels = {
        image: "描述你希望生成的画面、风格与构图…",
        video: "描述视频内容、镜头运动与节奏…",
    };
    return labels[activeType.value];
});
function selectCreationType(id) {
    activeType.value = id;
    applyCapabilityDefaults();
}
async function startCreation() {
    if (!prompt.value.trim()) {
        ElMessage.info("先写下你的创作想法");
        return;
    }
    if (activeType.value === "video") {
        ElMessage.info("当前后端暂未配置视频生成渠道");
        return;
    }
    if (creating.value)
        return;
    creating.value = true;
    try {
        const task = await createImageGeneration({
            prompt: prompt.value.trim(),
            model: selectedModel.value,
            size: selectedSize.value,
            quality: selectedQuality.value,
        });
        ElMessage.success(`生成任务已创建：${task.taskId.slice(0, 8)}`);
        await router.push("/assets");
    }
    catch (error) {
        ElMessage.error(apiErrorMessage(error, "图片生成任务创建失败"));
    }
    finally {
        creating.value = false;
    }
}
function openPlaceholder(label) {
    ElMessage.info(`${label} 页面将在下一阶段接入`);
}
function applyCapabilityDefaults() {
    const capability = currentCapability.value;
    selectedModel.value = capability?.models[0]?.value || "";
    selectedSize.value = capability?.sizes[0]?.value || "";
    selectedQuality.value = capability?.qualities[0]?.value || "";
}
async function loadRecentWorks() {
    recentLoading.value = true;
    try {
        const page = await assetApi.listAssets({ page: 1, pageSize: 8, source: "generated" });
        recentWorks.value = page.items.slice(0, 4);
        const entries = await Promise.all(recentWorks.value.map(async (work) => {
            if (work.status !== "ready" || !work.url)
                return [work.id, ""];
            try {
                const blob = await assetApi.getAssetContent(work.url);
                return [work.id, URL.createObjectURL(blob)];
            }
            catch {
                return [work.id, ""];
            }
        }));
        revokeRecentPreviewUrls();
        recentPreviewUrls.value = Object.fromEntries(entries);
    }
    catch (error) {
        ElMessage.error(apiErrorMessage(error, "最近创作加载失败"));
    }
    finally {
        recentLoading.value = false;
    }
}
function revokeRecentPreviewUrls() {
    Object.values(recentPreviewUrls.value).forEach((url) => url && URL.revokeObjectURL(url));
    recentPreviewUrls.value = {};
}
function recentMeta(work) {
    if (work.status === "generating")
        return "生成中";
    if (work.status === "failed")
        return "生成失败";
    if (work.type === "video" && work.durationSeconds !== undefined) {
        const minutes = Math.floor(work.durationSeconds / 60);
        const seconds = Math.floor(work.durationSeconds % 60);
        return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    }
    return work.width > 0 && work.height > 0 ? `${work.width}×${work.height}` : "已完成";
}
onMounted(() => {
    void loadRecentWorks();
});
onBeforeUnmount(revokeRecentPreviewUrls);
const __VLS_ctx = {};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
void __VLS_ctx, __VLS_components, __VLS_intrinsics, __VLS_directives;
// @ts-ignore
__VLS_withDotValue(darkMode, {});
// @ts-ignore
__VLS_withDotValue(authStore, {});
// @ts-ignore
__VLS_withDotValue(activeType, {});
// @ts-ignore
__VLS_withDotValue(currentCapability, {});
// @ts-ignore
__VLS_withDotValue(creating, {});
// @ts-ignore
__VLS_withDotValue(router, {});
// @ts-ignore
__VLS_withDotValue(recentLoading, {});
// @ts-ignore
__VLS_withDotValue(recentWorks, {});
// @ts-ignore
__VLS_withDotValue(recentPreviewUrls, {});
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "home-page" },
    ...{ class: ({ 'home-page--dark': darkMode.value }) },
});
/** @type {__VLS_StyleScopedClasses['home-page']} */ ;
/** @type {__VLS_StyleScopedClasses['home-page--dark']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
    ...{ class: "creation-stage" },
});
/** @type {__VLS_StyleScopedClasses['creation-stage']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "creation-stage__toolbar" },
});
/** @type {__VLS_StyleScopedClasses['creation-stage__toolbar']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ class: "round-action" },
    type: "button",
    'aria-label': "通知",
});
/** @type {__VLS_StyleScopedClasses['round-action']} */ ;
let __VLS_0;
/** @ts-ignore @type { | typeof __VLS_components.Bell} */
Bell;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
    // @ts-ignore
    size: (18),
}));
const __VLS_2 = __VLS_1({
    size: (18),
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
__VLS_asFunctionalElement1(__VLS_intrinsics.span)({
    ...{ class: "round-action__dot" },
});
/** @type {__VLS_StyleScopedClasses['round-action__dot']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: // @ts-ignore
        (...[$event]) => {
            void $event;
            return (darkMode.value = !darkMode.value);
            // @ts-ignore
            [darkMode, darkMode, darkMode,];
        } },
    ...{ class: "round-action" },
    type: "button",
    'aria-label': (darkMode.value ? '切换浅色模式' : '切换深色模式'),
});
/** @type {__VLS_StyleScopedClasses['round-action']} */ ;
if (darkMode.value) {
    let __VLS_5;
    /** @ts-ignore @type { | typeof __VLS_components.Sun} */
    Sun;
    // @ts-ignore
    const __VLS_6 = __VLS_asFunctionalComponent1(__VLS_5, new __VLS_5({
        // @ts-ignore
        size: (19),
    }));
    const __VLS_7 = __VLS_6({
        size: (19),
    }, ...__VLS_functionalComponentArgsRest(__VLS_6));
}
else {
    let __VLS_10;
    /** @ts-ignore @type { | typeof __VLS_components.Moon} */
    Moon;
    // @ts-ignore
    const __VLS_11 = __VLS_asFunctionalComponent1(__VLS_10, new __VLS_10({
        // @ts-ignore
        size: (19),
    }));
    const __VLS_12 = __VLS_11({
        size: (19),
    }, ...__VLS_functionalComponentArgsRest(__VLS_11));
}
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "header-avatar" },
});
/** @type {__VLS_StyleScopedClasses['header-avatar']} */ ;
(authStore.value.userInitial);
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "creation-stage__intro" },
});
/** @type {__VLS_StyleScopedClasses['creation-stage__intro']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.h1, __VLS_intrinsics.h1)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "composer" },
    'aria-label': "AI 创作输入区",
});
/** @type {__VLS_StyleScopedClasses['composer']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "composer__tabs" },
    role: "tablist",
    'aria-label': "创作类型",
});
/** @type {__VLS_StyleScopedClasses['composer__tabs']} */ ;
const __VLS_15 = __VLS_tryAsConstant((__VLS_unwrap(creationTypes, {})));
for (const [type] of __VLS_vFor(__VLS_nonNull(__VLS_15))) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: // @ts-ignore
            (...[$event]) => {
                void $event;
                return (selectCreationType(type.id));
                // @ts-ignore
                [darkMode, darkMode, authStore, creationTypes,];
            } },
        key: (type.id),
        type: "button",
        role: "tab",
        'aria-selected': (activeType.value === type.id),
        ...{ class: ({ 'composer__tab--active': activeType.value === type.id }) },
    });
    /** @type {__VLS_StyleScopedClasses['composer__tab--active']} */ ;
    const __VLS_16 = (type.icon);
    // @ts-ignore
    const __VLS_17 = __VLS_asFunctionalComponent1(__VLS_16, new __VLS_16({
        // @ts-ignore
        size: (17),
    }));
    const __VLS_18 = __VLS_17({
        size: (17),
    }, ...__VLS_functionalComponentArgsRest(__VLS_17));
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    (type.label);
    // @ts-ignore
    [activeType, activeType,];
}
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "composer__body" },
});
/** @type {__VLS_StyleScopedClasses['composer__body']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: // @ts-ignore
        (...[$event]) => {
            void $event;
            return (openPlaceholder('参考素材'));
            // @ts-ignore
            [];
        } },
    ...{ class: "reference-slot" },
    type: "button",
});
/** @type {__VLS_StyleScopedClasses['reference-slot']} */ ;
let __VLS_21;
/** @ts-ignore @type { | typeof __VLS_components.Paperclip} */
Paperclip;
// @ts-ignore
const __VLS_22 = __VLS_asFunctionalComponent1(__VLS_21, new __VLS_21({
    // @ts-ignore
    size: (21),
}));
const __VLS_23 = __VLS_22({
    size: (21),
}, ...__VLS_functionalComponentArgsRest(__VLS_22));
__VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "composer__input-wrap" },
});
/** @type {__VLS_StyleScopedClasses['composer__input-wrap']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.textarea)({
    value: (__VLS_unwrap(prompt, {})),
    placeholder: (__VLS_unwrap(promptPlaceholder, {})),
    rows: "3",
    maxlength: "1000",
});
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "composer__options" },
});
/** @type {__VLS_StyleScopedClasses['composer__options']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "composer__selects" },
});
/** @type {__VLS_StyleScopedClasses['composer__selects']} */ ;
let __VLS_26;
/** @ts-ignore @type { | typeof __VLS_components.elSelect | typeof __VLS_components.ElSelect | typeof __VLS_components['el-select'] | typeof __VLS_components.elSelect | typeof __VLS_components.ElSelect | typeof __VLS_components['el-select']} */
elSelect;
// @ts-ignore
const __VLS_27 = __VLS_asFunctionalComponent1(__VLS_26, new __VLS_26({
    // @ts-ignore
    modelValue: (__VLS_unwrap(selectedModel, {})), ...{ class: "compact-select" }, 'aria-label': "模型", disabled: true,
}));
const __VLS_28 = __VLS_27({
    modelValue: (__VLS_unwrap(selectedModel, {})),
    ...{ class: "compact-select" },
    'aria-label': "模型",
    disabled: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_27));
/** @type {__VLS_StyleScopedClasses['compact-select']} */ ;
const { default: __VLS_31 } = __VLS_nonNull(__VLS_29.slots);
const __VLS_32 = __VLS_tryAsConstant((currentCapability.value?.models || []));
for (const [option] of __VLS_vFor(__VLS_nonNull(__VLS_32))) {
    let __VLS_33;
    /** @ts-ignore @type { | typeof __VLS_components.elOption | typeof __VLS_components.ElOption | typeof __VLS_components['el-option']} */
    elOption;
    // @ts-ignore
    const __VLS_34 = __VLS_asFunctionalComponent1(__VLS_33, new __VLS_33({
        // @ts-ignore
        key: (option.value), label: (option.label), value: (option.value),
    }));
    const __VLS_35 = __VLS_34({
        key: (option.value),
        label: (option.label),
        value: (option.value),
    }, ...__VLS_functionalComponentArgsRest(__VLS_34));
    // @ts-ignore
    [prompt, promptPlaceholder, selectedModel, currentCapability,];
}
// @ts-ignore
[];
var __VLS_29;
let __VLS_38;
/** @ts-ignore @type { | typeof __VLS_components.elSelect | typeof __VLS_components.ElSelect | typeof __VLS_components['el-select'] | typeof __VLS_components.elSelect | typeof __VLS_components.ElSelect | typeof __VLS_components['el-select']} */
elSelect;
// @ts-ignore
const __VLS_39 = __VLS_asFunctionalComponent1(__VLS_38, new __VLS_38({
    // @ts-ignore
    modelValue: (__VLS_unwrap(selectedSize, {})), ...{ class: "compact-select compact-select--small" }, 'aria-label': "画面比例", disabled: (!currentCapability.value?.enabled),
}));
const __VLS_40 = __VLS_39({
    modelValue: (__VLS_unwrap(selectedSize, {})),
    ...{ class: "compact-select compact-select--small" },
    'aria-label': "画面比例",
    disabled: (!currentCapability.value?.enabled),
}, ...__VLS_functionalComponentArgsRest(__VLS_39));
/** @type {__VLS_StyleScopedClasses['compact-select']} */ ;
/** @type {__VLS_StyleScopedClasses['compact-select--small']} */ ;
const { default: __VLS_43 } = __VLS_nonNull(__VLS_41.slots);
const __VLS_44 = __VLS_tryAsConstant((currentCapability.value?.sizes || []));
for (const [option] of __VLS_vFor(__VLS_nonNull(__VLS_44))) {
    let __VLS_45;
    /** @ts-ignore @type { | typeof __VLS_components.elOption | typeof __VLS_components.ElOption | typeof __VLS_components['el-option']} */
    elOption;
    // @ts-ignore
    const __VLS_46 = __VLS_asFunctionalComponent1(__VLS_45, new __VLS_45({
        // @ts-ignore
        key: (option.value), label: (option.label), value: (option.value),
    }));
    const __VLS_47 = __VLS_46({
        key: (option.value),
        label: (option.label),
        value: (option.value),
    }, ...__VLS_functionalComponentArgsRest(__VLS_46));
    // @ts-ignore
    [currentCapability, currentCapability, selectedSize,];
}
// @ts-ignore
[];
var __VLS_41;
let __VLS_50;
/** @ts-ignore @type { | typeof __VLS_components.elSelect | typeof __VLS_components.ElSelect | typeof __VLS_components['el-select'] | typeof __VLS_components.elSelect | typeof __VLS_components.ElSelect | typeof __VLS_components['el-select']} */
elSelect;
// @ts-ignore
const __VLS_51 = __VLS_asFunctionalComponent1(__VLS_50, new __VLS_50({
    // @ts-ignore
    modelValue: (__VLS_unwrap(selectedQuality, {})), ...{ class: "compact-select compact-select--small" }, 'aria-label': "分辨率", disabled: (!currentCapability.value?.enabled),
}));
const __VLS_52 = __VLS_51({
    modelValue: (__VLS_unwrap(selectedQuality, {})),
    ...{ class: "compact-select compact-select--small" },
    'aria-label': "分辨率",
    disabled: (!currentCapability.value?.enabled),
}, ...__VLS_functionalComponentArgsRest(__VLS_51));
/** @type {__VLS_StyleScopedClasses['compact-select']} */ ;
/** @type {__VLS_StyleScopedClasses['compact-select--small']} */ ;
const { default: __VLS_55 } = __VLS_nonNull(__VLS_53.slots);
const __VLS_56 = __VLS_tryAsConstant((currentCapability.value?.qualities || []));
for (const [option] of __VLS_vFor(__VLS_nonNull(__VLS_56))) {
    let __VLS_57;
    /** @ts-ignore @type { | typeof __VLS_components.elOption | typeof __VLS_components.ElOption | typeof __VLS_components['el-option']} */
    elOption;
    // @ts-ignore
    const __VLS_58 = __VLS_asFunctionalComponent1(__VLS_57, new __VLS_57({
        // @ts-ignore
        key: (option.value), label: (option.label), value: (option.value),
    }));
    const __VLS_59 = __VLS_58({
        key: (option.value),
        label: (option.label),
        value: (option.value),
    }, ...__VLS_functionalComponentArgsRest(__VLS_58));
    // @ts-ignore
    [currentCapability, currentCapability, selectedQuality,];
}
// @ts-ignore
[];
var __VLS_53;
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (startCreation) },
    ...{ class: "create-button" },
    type: "button",
    disabled: (creating.value),
});
/** @type {__VLS_StyleScopedClasses['create-button']} */ ;
if (creating.value) {
    let __VLS_62;
    /** @ts-ignore @type { | typeof __VLS_components.LoaderCircle} */
    LoaderCircle;
    // @ts-ignore
    const __VLS_63 = __VLS_asFunctionalComponent1(__VLS_62, new __VLS_62({
        // @ts-ignore
        ...{ class: "spin" }, size: (18),
    }));
    const __VLS_64 = __VLS_63({
        ...{ class: "spin" },
        size: (18),
    }, ...__VLS_functionalComponentArgsRest(__VLS_63));
    /** @type {__VLS_StyleScopedClasses['spin']} */ ;
}
else {
    let __VLS_67;
    /** @ts-ignore @type { | typeof __VLS_components.Sparkles} */
    Sparkles;
    // @ts-ignore
    const __VLS_68 = __VLS_asFunctionalComponent1(__VLS_67, new __VLS_67({
        // @ts-ignore
        size: (18),
    }));
    const __VLS_69 = __VLS_68({
        size: (18),
    }, ...__VLS_functionalComponentArgsRest(__VLS_68));
}
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
(creating.value ? "提交中" : "开始生成");
let __VLS_72;
/** @ts-ignore @type { | typeof __VLS_components.ArrowRight} */
ArrowRight;
// @ts-ignore
const __VLS_73 = __VLS_asFunctionalComponent1(__VLS_72, new __VLS_72({
    // @ts-ignore
    size: (17),
}));
const __VLS_74 = __VLS_73({
    size: (17),
}, ...__VLS_functionalComponentArgsRest(__VLS_73));
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "home-content" },
});
/** @type {__VLS_StyleScopedClasses['home-content']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "content-columns" },
});
/** @type {__VLS_StyleScopedClasses['content-columns']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
    ...{ class: "content-section" },
});
/** @type {__VLS_StyleScopedClasses['content-section']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "section-heading" },
});
/** @type {__VLS_StyleScopedClasses['section-heading']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "section-heading__icon section-heading__icon--blue" },
});
/** @type {__VLS_StyleScopedClasses['section-heading__icon']} */ ;
/** @type {__VLS_StyleScopedClasses['section-heading__icon--blue']} */ ;
let __VLS_77;
/** @ts-ignore @type { | typeof __VLS_components.Clock3} */
Clock3;
// @ts-ignore
const __VLS_78 = __VLS_asFunctionalComponent1(__VLS_77, new __VLS_77({
    // @ts-ignore
    size: (16),
}));
const __VLS_79 = __VLS_78({
    size: (16),
}, ...__VLS_functionalComponentArgsRest(__VLS_78));
__VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: // @ts-ignore
        (...[$event]) => {
            void $event;
            return (router.value.push('/assets'));
            // @ts-ignore
            [creating, creating, creating, router,];
        } },
    type: "button",
});
let __VLS_82;
/** @ts-ignore @type { | typeof __VLS_components.ArrowRight} */
ArrowRight;
// @ts-ignore
const __VLS_83 = __VLS_asFunctionalComponent1(__VLS_82, new __VLS_82({
    // @ts-ignore
    size: (15),
}));
const __VLS_84 = __VLS_83({
    size: (15),
}, ...__VLS_functionalComponentArgsRest(__VLS_83));
if (recentLoading.value) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "media-grid media-grid--recent" },
        'aria-label': "正在加载最近创作",
    });
    /** @type {__VLS_StyleScopedClasses['media-grid']} */ ;
    /** @type {__VLS_StyleScopedClasses['media-grid--recent']} */ ;
    const __VLS_87 = __VLS_tryAsConstant((4));
    for (const [index] of __VLS_vFor(__VLS_nonNull(__VLS_87))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.span)({
            key: (index),
            ...{ class: "media-tile media-tile--loading" },
        });
        /** @type {__VLS_StyleScopedClasses['media-tile']} */ ;
        /** @type {__VLS_StyleScopedClasses['media-tile--loading']} */ ;
        // @ts-ignore
        [recentLoading,];
    }
}
else if (recentWorks.value.length) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "media-grid media-grid--recent" },
    });
    /** @type {__VLS_StyleScopedClasses['media-grid']} */ ;
    /** @type {__VLS_StyleScopedClasses['media-grid--recent']} */ ;
    const __VLS_88 = __VLS_tryAsConstant((recentWorks.value));
    for (const [work] of __VLS_vFor(__VLS_nonNull(__VLS_88))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: // @ts-ignore
                (...[$event]) => {
                    void $event;
                    if (!!(recentLoading.value))
                        throw 0;
                    if (!(recentWorks.value.length))
                        throw 0;
                    return (router.value.push('/assets'));
                    // @ts-ignore
                    [router, recentWorks, recentWorks,];
                } },
            key: (work.id),
            type: "button",
            ...{ class: "media-tile" },
        });
        /** @type {__VLS_StyleScopedClasses['media-tile']} */ ;
        if (recentPreviewUrls.value[work.id]) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.img)({
                src: (recentPreviewUrls.value[work.id]),
                alt: (work.title),
            });
        }
        else {
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "media-tile__state" },
            });
            /** @type {__VLS_StyleScopedClasses['media-tile__state']} */ ;
            (recentMeta(work));
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.span)({
            ...{ class: "media-tile__overlay" },
        });
        /** @type {__VLS_StyleScopedClasses['media-tile__overlay']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "media-tile__top" },
        });
        /** @type {__VLS_StyleScopedClasses['media-tile__top']} */ ;
        (work.type === "image" ? "图片" : "视频");
        if (work.type === 'video' && work.status === 'ready') {
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "media-tile__play" },
            });
            /** @type {__VLS_StyleScopedClasses['media-tile__play']} */ ;
            let __VLS_89;
            /** @ts-ignore @type { | typeof __VLS_components.Play} */
            Play;
            // @ts-ignore
            const __VLS_90 = __VLS_asFunctionalComponent1(__VLS_89, new __VLS_89({
                // @ts-ignore
                size: (16), fill: "currentColor",
            }));
            const __VLS_91 = __VLS_90({
                size: (16),
                fill: "currentColor",
            }, ...__VLS_functionalComponentArgsRest(__VLS_90));
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "media-tile__caption" },
            ...{ class: ({ 'media-tile__caption--full': work.type !== 'video' || work.status !== 'ready' }) },
        });
        /** @type {__VLS_StyleScopedClasses['media-tile__caption']} */ ;
        /** @type {__VLS_StyleScopedClasses['media-tile__caption--full']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
        (work.title);
        __VLS_asFunctionalElement1(__VLS_intrinsics.small, __VLS_intrinsics.small)({});
        (recentMeta(work));
        // @ts-ignore
        [recentPreviewUrls, recentPreviewUrls,];
    }
}
else {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "recent-empty" },
    });
    /** @type {__VLS_StyleScopedClasses['recent-empty']} */ ;
}
// @ts-ignore
[];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
