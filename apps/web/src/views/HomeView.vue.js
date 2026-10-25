import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { useIntervalFn } from "@vueuse/core";
import { ArrowRight, Bell, ChevronDown, Clock3, Image, LoaderCircle, Moon, Paperclip, Play, Sparkles, Sun, Video, } from "@lucide/vue";
import { useAuthStore } from "@/stores/auth";
import * as assetApi from "@/services/assets";
import { createImageGeneration, } from "@/services/generation";
import { apiErrorMessage } from "@/services/http";
import { listImageModels } from "@/services/models";
import { notification } from "@/services/notifications";
const authStore = useAuthStore();
const router = useRouter();
const creationTypes = [
    { id: "image", label: "图片生成", icon: Image },
    { id: "video", label: "视频生成", icon: Video },
];
const defaultCapabilities = {
    image: {
        enabled: true,
        models: [],
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
const selectedModel = ref("");
const selectedSize = ref("16:9");
const selectedQuality = ref("2K");
const darkMode = ref(false);
const creating = ref(false);
const modelsLoading = ref(true);
const recentLoading = ref(true);
const recentRefreshing = ref(false);
const recentWorks = ref([]);
const recentPreviewUrls = ref({});
const recentPreviewSignatures = ref({});
const showHeroBackdrop = ref(false);
let recentLoadSequence = 0;
let heroIdleHandle;
const currentCapability = computed(() => capabilities.value[activeType.value]);
const hasGeneratingRecentWorks = computed(() => recentWorks.value.some((work) => work.status === "generating"));
const refreshInterval = Number(import.meta.env.VITE_GENERATION_REFRESH_INTERVAL_MS || 3000);
const { pause: pauseRecentRefresh, resume: resumeRecentRefresh } = useIntervalFn(() => {
    if (!recentLoading.value && !recentRefreshing.value && hasGeneratingRecentWorks.value)
        void loadRecentWorks({ silent: true });
}, Number.isFinite(refreshInterval) && refreshInterval > 0 ? refreshInterval : 3000, { immediate: false });
watch(hasGeneratingRecentWorks, (hasGenerating) => (hasGenerating ? resumeRecentRefresh() : pauseRecentRefresh()), { immediate: true });
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
        notification.info("先写下你的创作想法");
        return;
    }
    if (activeType.value === "video") {
        notification.info("当前后端暂未配置视频生成渠道");
        return;
    }
    if (!selectedModel.value) {
        notification.warning("当前没有可用的图片模型，请联系管理员配置模型渠道");
        return;
    }
    if (creating.value)
        return;
    creating.value = true;
    try {
        const submittedPrompt = prompt.value.trim();
        const task = await createImageGeneration({
            prompt: submittedPrompt,
            model: selectedModel.value,
            size: selectedSize.value,
            quality: selectedQuality.value,
        });
        const pendingAsset = {
            id: task.assetId,
            type: "image",
            source: "generated",
            status: "generating",
            title: submittedPrompt.slice(0, 80),
            url: "",
            downloadUrl: "",
            sizeBytes: 0,
            width: task.width,
            height: task.height,
            createdAt: task.createdAt,
        };
        recentWorks.value = [
            pendingAsset,
            ...recentWorks.value.filter((work) => work.id !== task.assetId),
        ].slice(0, 4);
        authStore.setPointsBalance(task.pointsRemaining);
        notification.success(`生成任务已创建：${task.taskId.slice(0, 8)}`);
        await loadRecentWorks({ silent: true });
    }
    catch (error) {
        notification.error(apiErrorMessage(error, "图片生成任务创建失败"));
    }
    finally {
        creating.value = false;
    }
}
function openPlaceholder(label) {
    notification.info(`${label} 页面将在下一阶段接入`);
}
function applyCapabilityDefaults() {
    const capability = currentCapability.value;
    selectedModel.value = capability?.models[0]?.value || "";
    selectedSize.value = capability?.sizes[0]?.value || "";
    selectedQuality.value = capability?.qualities[0]?.value || "";
}
async function loadRecentWorks(options = {}) {
    const sequence = ++recentLoadSequence;
    if (options.silent)
        recentRefreshing.value = true;
    else
        recentLoading.value = true;
    try {
        const page = await assetApi.listAssets({ page: 1, pageSize: 8, source: "generated" });
        if (sequence !== recentLoadSequence)
            return;
        const nextWorks = page.items.slice(0, 4);
        const refunded = nextWorks.some((work) => work.status === "failed" && recentWorks.value.find((current) => current.id === work.id)?.status === "generating");
        recentWorks.value = nextWorks;
        if (refunded)
            void authStore.refreshPointsBalance();
        await loadRecentPreviewUrls(nextWorks, sequence);
    }
    catch (error) {
        if (sequence === recentLoadSequence && !options.silent)
            notification.error(apiErrorMessage(error, "最近创作加载失败"));
    }
    finally {
        if (sequence === recentLoadSequence) {
            recentLoading.value = false;
            recentRefreshing.value = false;
        }
    }
}
async function loadRecentPreviewUrls(works, sequence) {
    const existingUrls = recentPreviewUrls.value;
    const existingSignatures = recentPreviewSignatures.value;
    const entries = await Promise.all(works.map(async (work) => {
        const signature = `${work.status}:${work.url}:${work.sizeBytes}`;
        if (work.status !== "ready" || !work.url)
            return { id: work.id, url: "", signature, created: false };
        if (existingUrls[work.id] && existingSignatures[work.id] === signature)
            return { id: work.id, url: existingUrls[work.id], signature, created: false };
        try {
            const blob = await assetApi.getAssetContent(work.url);
            return { id: work.id, url: URL.createObjectURL(blob), signature, created: true };
        }
        catch {
            return { id: work.id, url: "", signature: "", created: false };
        }
    }));
    if (sequence !== recentLoadSequence) {
        entries.forEach((entry) => entry.created && entry.url && URL.revokeObjectURL(entry.url));
        return;
    }
    const nextUrls = Object.fromEntries(entries.map((entry) => [entry.id, entry.url]));
    const nextSignatures = Object.fromEntries(entries.map((entry) => [entry.id, entry.signature]));
    Object.entries(existingUrls).forEach(([id, url]) => {
        if (url && nextUrls[id] !== url)
            URL.revokeObjectURL(url);
    });
    recentPreviewUrls.value = nextUrls;
    recentPreviewSignatures.value = nextSignatures;
}
async function loadModels() {
    modelsLoading.value = true;
    try {
        const models = await listImageModels();
        capabilities.value.image.models = models.map((model) => ({ value: model.id, label: model.displayName }));
        if (!models.some((model) => model.id === selectedModel.value))
            selectedModel.value = models[0]?.id || "";
    }
    catch (error) {
        capabilities.value.image.models = [];
        selectedModel.value = "";
        notification.error(apiErrorMessage(error, "图片模型加载失败"));
    }
    finally {
        modelsLoading.value = false;
    }
}
function revokeRecentPreviewUrls() {
    Object.values(recentPreviewUrls.value).forEach((url) => url && URL.revokeObjectURL(url));
    recentPreviewUrls.value = {};
    recentPreviewSignatures.value = {};
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
    void Promise.all([loadModels(), loadRecentWorks()]);
    if ("requestIdleCallback" in window)
        heroIdleHandle = window.requestIdleCallback(() => (showHeroBackdrop.value = true));
    else
        requestAnimationFrame(() => (showHeroBackdrop.value = true));
});
onBeforeUnmount(() => {
    if (heroIdleHandle !== undefined && "cancelIdleCallback" in window)
        window.cancelIdleCallback(heroIdleHandle);
    pauseRecentRefresh();
    revokeRecentPreviewUrls();
});
const __VLS_ctx = {};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
void __VLS_ctx, __VLS_components, __VLS_intrinsics, __VLS_directives;
// @ts-ignore
__VLS_withDotValue(showHeroBackdrop, {});
// @ts-ignore
__VLS_withDotValue(darkMode, {});
// @ts-ignore
__VLS_withDotValue(authStore, {});
// @ts-ignore
__VLS_withDotValue(activeType, {});
// @ts-ignore
__VLS_withDotValue(modelsLoading, {});
// @ts-ignore
__VLS_withDotValue(currentCapability, {});
// @ts-ignore
__VLS_withDotValue(creating, {});
// @ts-ignore
__VLS_withDotValue(selectedModel, {});
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
if (showHeroBackdrop.value) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.img)({
        ...{ class: "creation-stage__backdrop" },
        src: "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=2200&q=82",
        alt: "",
        loading: "lazy",
        decoding: "async",
        fetchpriority: "low",
    });
    /** @type {__VLS_StyleScopedClasses['creation-stage__backdrop']} */ ;
}
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
            [darkMode, darkMode, darkMode, showHeroBackdrop,];
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
__VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
    ...{ class: "compact-select" },
});
/** @type {__VLS_StyleScopedClasses['compact-select']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.select, __VLS_intrinsics.select)({
    value: (selectedModel.value),
    'aria-label': "模型",
    disabled: (modelsLoading.value || !currentCapability.value?.models.length),
});
if (modelsLoading.value) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
        value: "",
    });
}
else if (!currentCapability.value?.models.length) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
        value: "",
    });
}
const __VLS_26 = __VLS_tryAsConstant((currentCapability.value?.models || []));
for (const [option] of __VLS_vFor(__VLS_nonNull(__VLS_26))) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
        key: (option.value),
        value: (option.value),
    });
    (option.label);
    // @ts-ignore
    [prompt, promptPlaceholder, selectedModel, modelsLoading, modelsLoading, currentCapability, currentCapability, currentCapability,];
}
let __VLS_27;
/** @ts-ignore @type { | typeof __VLS_components.ChevronDown} */
ChevronDown;
// @ts-ignore
const __VLS_28 = __VLS_asFunctionalComponent1(__VLS_27, new __VLS_27({
    // @ts-ignore
    size: (14),
}));
const __VLS_29 = __VLS_28({
    size: (14),
}, ...__VLS_functionalComponentArgsRest(__VLS_28));
__VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
    ...{ class: "compact-select compact-select--small" },
});
/** @type {__VLS_StyleScopedClasses['compact-select']} */ ;
/** @type {__VLS_StyleScopedClasses['compact-select--small']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.select, __VLS_intrinsics.select)({
    value: (__VLS_unwrap(selectedSize, {})),
    'aria-label': "画面比例",
    disabled: (!currentCapability.value?.enabled),
});
const __VLS_32 = __VLS_tryAsConstant((currentCapability.value?.sizes || []));
for (const [option] of __VLS_vFor(__VLS_nonNull(__VLS_32))) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
        key: (option.value),
        value: (option.value),
    });
    (option.label);
    // @ts-ignore
    [currentCapability, currentCapability, selectedSize,];
}
let __VLS_33;
/** @ts-ignore @type { | typeof __VLS_components.ChevronDown} */
ChevronDown;
// @ts-ignore
const __VLS_34 = __VLS_asFunctionalComponent1(__VLS_33, new __VLS_33({
    // @ts-ignore
    size: (14),
}));
const __VLS_35 = __VLS_34({
    size: (14),
}, ...__VLS_functionalComponentArgsRest(__VLS_34));
__VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
    ...{ class: "compact-select compact-select--small" },
});
/** @type {__VLS_StyleScopedClasses['compact-select']} */ ;
/** @type {__VLS_StyleScopedClasses['compact-select--small']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.select, __VLS_intrinsics.select)({
    value: (__VLS_unwrap(selectedQuality, {})),
    'aria-label': "分辨率",
    disabled: (!currentCapability.value?.enabled),
});
const __VLS_38 = __VLS_tryAsConstant((currentCapability.value?.qualities || []));
for (const [option] of __VLS_vFor(__VLS_nonNull(__VLS_38))) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
        key: (option.value),
        value: (option.value),
    });
    (option.label);
    // @ts-ignore
    [currentCapability, currentCapability, selectedQuality,];
}
let __VLS_39;
/** @ts-ignore @type { | typeof __VLS_components.ChevronDown} */
ChevronDown;
// @ts-ignore
const __VLS_40 = __VLS_asFunctionalComponent1(__VLS_39, new __VLS_39({
    // @ts-ignore
    size: (14),
}));
const __VLS_41 = __VLS_40({
    size: (14),
}, ...__VLS_functionalComponentArgsRest(__VLS_40));
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (startCreation) },
    ...{ class: "create-button" },
    type: "button",
    disabled: (creating.value || modelsLoading.value || !selectedModel.value),
});
/** @type {__VLS_StyleScopedClasses['create-button']} */ ;
if (creating.value) {
    let __VLS_44;
    /** @ts-ignore @type { | typeof __VLS_components.LoaderCircle} */
    LoaderCircle;
    // @ts-ignore
    const __VLS_45 = __VLS_asFunctionalComponent1(__VLS_44, new __VLS_44({
        // @ts-ignore
        ...{ class: "spin" }, size: (18),
    }));
    const __VLS_46 = __VLS_45({
        ...{ class: "spin" },
        size: (18),
    }, ...__VLS_functionalComponentArgsRest(__VLS_45));
    /** @type {__VLS_StyleScopedClasses['spin']} */ ;
}
else {
    let __VLS_49;
    /** @ts-ignore @type { | typeof __VLS_components.Sparkles} */
    Sparkles;
    // @ts-ignore
    const __VLS_50 = __VLS_asFunctionalComponent1(__VLS_49, new __VLS_49({
        // @ts-ignore
        size: (18),
    }));
    const __VLS_51 = __VLS_50({
        size: (18),
    }, ...__VLS_functionalComponentArgsRest(__VLS_50));
}
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
(creating.value ? "提交中" : "开始生成");
let __VLS_54;
/** @ts-ignore @type { | typeof __VLS_components.ArrowRight} */
ArrowRight;
// @ts-ignore
const __VLS_55 = __VLS_asFunctionalComponent1(__VLS_54, new __VLS_54({
    // @ts-ignore
    size: (17),
}));
const __VLS_56 = __VLS_55({
    size: (17),
}, ...__VLS_functionalComponentArgsRest(__VLS_55));
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
let __VLS_59;
/** @ts-ignore @type { | typeof __VLS_components.Clock3} */
Clock3;
// @ts-ignore
const __VLS_60 = __VLS_asFunctionalComponent1(__VLS_59, new __VLS_59({
    // @ts-ignore
    size: (16),
}));
const __VLS_61 = __VLS_60({
    size: (16),
}, ...__VLS_functionalComponentArgsRest(__VLS_60));
__VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: // @ts-ignore
        (...[$event]) => {
            void $event;
            return (router.value.push('/assets'));
            // @ts-ignore
            [selectedModel, modelsLoading, creating, creating, creating, router,];
        } },
    type: "button",
});
let __VLS_64;
/** @ts-ignore @type { | typeof __VLS_components.ArrowRight} */
ArrowRight;
// @ts-ignore
const __VLS_65 = __VLS_asFunctionalComponent1(__VLS_64, new __VLS_64({
    // @ts-ignore
    size: (15),
}));
const __VLS_66 = __VLS_65({
    size: (15),
}, ...__VLS_functionalComponentArgsRest(__VLS_65));
if (recentLoading.value) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "media-grid media-grid--recent" },
        'aria-label': "正在加载最近创作",
    });
    /** @type {__VLS_StyleScopedClasses['media-grid']} */ ;
    /** @type {__VLS_StyleScopedClasses['media-grid--recent']} */ ;
    const __VLS_69 = __VLS_tryAsConstant((4));
    for (const [index] of __VLS_vFor(__VLS_nonNull(__VLS_69))) {
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
    const __VLS_70 = __VLS_tryAsConstant((recentWorks.value));
    for (const [work] of __VLS_vFor(__VLS_nonNull(__VLS_70))) {
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
            let __VLS_71;
            /** @ts-ignore @type { | typeof __VLS_components.Play} */
            Play;
            // @ts-ignore
            const __VLS_72 = __VLS_asFunctionalComponent1(__VLS_71, new __VLS_71({
                // @ts-ignore
                size: (16), fill: "currentColor",
            }));
            const __VLS_73 = __VLS_72({
                size: (16),
                fill: "currentColor",
            }, ...__VLS_functionalComponentArgsRest(__VLS_72));
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
