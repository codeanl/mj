import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { useIntervalFn } from "@vueuse/core";
import { ArrowRight, Bell, ChevronDown, Clock3, Image, LoaderCircle, Music, Moon, Paperclip, Play, Plus, Sparkles, Sun, Type, Video, X, } from "@lucide/vue";
import { useAuthStore } from "@/stores/auth";
import AssetPreviewDialog from "@/components/AssetPreviewDialog.vue";
import * as assetApi from "@/services/assets";
import { createImageGeneration, createVideoGeneration, } from "@/services/generation";
import { apiErrorMessage } from "@/services/http";
import { listImageModels, listVideoModels } from "@/services/models";
import { notification } from "@/services/notifications";
const authStore = useAuthStore();
const router = useRouter();
const sameParametersStorageKey = "nova.same-generation-parameters";
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
    video: { enabled: false, models: [], sizes: [{ value: "adaptive", label: "自适应", width: 0, height: 0 }, { value: "21:9", label: "21:9", width: 0, height: 0 }, { value: "16:9", label: "16:9", width: 0, height: 0 }, { value: "4:3", label: "4:3", width: 0, height: 0 }, { value: "1:1", label: "1:1", width: 0, height: 0 }, { value: "3:4", label: "3:4", width: 0, height: 0 }, { value: "9:16", label: "9:16", width: 0, height: 0 }], qualities: [{ value: "480P", label: "480P" }, { value: "768P", label: "768P" }, { value: "1080P", label: "1080P" }, { value: "2K", label: "2K" }, { value: "4K", label: "4K" }], durations: Array.from({ length: 27 }, (_, index) => ({ value: String(index + 4), label: `${index + 4}秒` })) },
};
const activeType = ref("image");
const prompt = ref("");
const capabilities = ref(defaultCapabilities);
const selectedModel = ref("");
const selectedSize = ref("16:9");
const selectedQuality = ref("2K");
const selectedCount = ref(1);
const selectedDuration = ref(5);
const videoMode = ref("text");
const soundEnabled = ref(true);
const watermarkEnabled = ref(false);
const referenceInput = ref(null);
const references = ref([]);
const darkMode = ref(false);
const creating = ref(false);
const modelsLoading = ref(true);
const recentLoading = ref(true);
const recentRefreshing = ref(false);
const recentWorks = ref([]);
const recentPreviewUrls = ref({});
const recentPreviewSignatures = ref({});
const selectedRecent = ref(null);
const recentDetailUrl = ref("");
let recentDetailObjectUrl = "";
const showHeroBackdrop = ref(false);
let recentLoadSequence = 0;
let heroIdleHandle;
const currentCapability = computed(() => capabilities.value[activeType.value]);
const videoModes = [
    { value: "text", label: "文生视频" },
    { value: "frames", label: "首尾帧" },
    { value: "reference", label: "全能参考" },
];
const referenceLimit = computed(() => activeType.value === "image" ? 3 : videoMode.value === "frames" ? 2 : videoMode.value === "reference" ? 12 : 0);
const referenceAccept = computed(() => activeType.value === "image" || videoMode.value === "frames"
    ? "image/jpeg,image/png,image/webp"
    : "image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime,audio/mpeg,audio/wav,audio/x-wav,audio/ogg,audio/flac");
const referenceHint = computed(() => {
    if (activeType.value === "image")
        return "最多 3 张图片";
    if (videoMode.value === "frames")
        return "首帧与尾帧";
    if (videoMode.value === "reference")
        return "图片、视频或音频";
    return "无需上传素材";
});
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
    if (activeType.value !== id)
        clearReferencePreviews();
    activeType.value = id;
    applyCapabilityDefaults();
}
function selectVideoMode(mode) {
    if (videoMode.value === mode)
        return;
    clearReferencePreviews();
    videoMode.value = mode;
}
function changeVideoMode(event) {
    selectVideoMode(event.target.value);
}
async function startCreation() {
    if (!prompt.value.trim() && (activeType.value === "image" || videoMode.value === "text")) {
        notification.info("先写下你的创作想法");
        return;
    }
    if (activeType.value === "video" && videoMode.value !== "text" && references.value.length === 0) {
        notification.info(videoMode.value === "frames" ? "请添加首帧或尾帧" : "请添加参考素材");
        return;
    }
    if (activeType.value === "video" && videoMode.value === "reference" && references.value.every((reference) => reference.kind === "audio")) {
        notification.info("参考音频需要同时添加至少一张图片或一个视频");
        return;
    }
    if (!selectedModel.value) {
        notification.warning(`当前没有可用的${activeType.value === "video" ? "视频" : "图片"}模型，请联系管理员配置模型渠道`);
        return;
    }
    if (creating.value)
        return;
    creating.value = true;
    try {
        const submittedPrompt = prompt.value.trim();
        await Promise.all(references.value.map(async (reference) => {
            if (reference.assetId)
                return;
            const uploaded = await assetApi.uploadAsset(reference.file, "创作参考素材");
            reference.assetId = uploaded.id;
        }));
        const referenceAssetIds = references.value.map((reference) => reference.assetId);
        const videoReferences = references.value.map((reference) => ({ assetId: reference.assetId, role: reference.role }));
        const batch = activeType.value === "video" ? await createVideoGeneration({ prompt: submittedPrompt, model: selectedModel.value, size: selectedSize.value, quality: selectedQuality.value, durationSeconds: selectedDuration.value, soundEnabled: soundEnabled.value, watermarkEnabled: watermarkEnabled.value, mode: videoMode.value, ...(videoReferences.length ? { references: videoReferences } : {}) }) : await createImageGeneration({
            prompt: submittedPrompt,
            model: selectedModel.value,
            size: selectedSize.value,
            quality: selectedQuality.value,
            count: selectedCount.value,
            ...(referenceAssetIds.length ? { referenceAssetIds } : {}),
        });
        const pendingAssets = batch.tasks.map((task) => ({
            id: task.assetId, type: activeType.value, source: "generated", status: "generating",
            title: submittedPrompt.slice(0, 80) || (videoMode.value === "frames" ? "首尾帧视频" : "全能参考视频"), url: "", downloadUrl: "", sizeBytes: 0,
            width: task.width, height: task.height, createdAt: task.createdAt,
        }));
        const pendingIDs = new Set(pendingAssets.map((asset) => asset.id));
        recentWorks.value = [
            ...pendingAssets,
            ...recentWorks.value.filter((work) => !pendingIDs.has(work.id)),
        ].slice(0, 8);
        authStore.setPointsBalance(batch.pointsRemaining);
        notification.success(activeType.value === "video" ? "视频生成任务已创建" : `${batch.tasks.length} 张图片生成任务已创建`);
        await loadRecentWorks({ silent: true });
    }
    catch (error) {
        notification.error(apiErrorMessage(error, activeType.value === "video" ? "视频生成任务创建失败" : "图片生成任务创建失败"));
    }
    finally {
        creating.value = false;
    }
}
function chooseReference() {
    if (referenceLimit.value > 0)
        referenceInput.value?.click();
}
function selectReference(event) {
    const input = event.target;
    const files = Array.from(input.files || []);
    input.value = "";
    if (!files.length)
        return;
    const imageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
    const videoTypes = new Set(["video/mp4", "video/webm", "video/quicktime"]);
    const audioTypes = new Set(["audio/mpeg", "audio/wav", "audio/x-wav", "audio/ogg", "audio/flac"]);
    let rejected = false;
    for (const file of files) {
        if (references.value.length >= referenceLimit.value) {
            rejected = true;
            break;
        }
        const kind = imageTypes.has(file.type) ? "image" : videoTypes.has(file.type) ? "video" : audioTypes.has(file.type) ? "audio" : "";
        if (!kind || ((activeType.value === "image" || videoMode.value === "frames") && kind !== "image")) {
            rejected = true;
            continue;
        }
        if (videoMode.value === "reference" && references.value.filter((reference) => reference.kind === kind).length >= ({ image: 9, video: 3, audio: 3 }[kind])) {
            rejected = true;
            continue;
        }
        const key = `${file.name}:${file.size}:${file.lastModified}`;
        if (references.value.some((reference) => reference.key === key))
            continue;
        const role = activeType.value === "image" ? "" : videoMode.value === "frames" ? (references.value.some((reference) => reference.role === "first_frame") ? "last_frame" : "first_frame") : kind === "image" ? "reference_image" : kind === "video" ? "reference_video" : "reference_audio";
        references.value.push({ key, file, previewUrl: URL.createObjectURL(file), assetId: "", kind, role });
    }
    if (rejected)
        notification.warning(activeType.value === "image" ? "最多添加 3 张 JPG、PNG 或 WebP 参考图" : videoMode.value === "frames" ? "首尾帧只能添加最多 2 张图片" : "全能参考最多 9 张图片、3 个视频、3 个音频，总计 12 个");
}
function clearReferencePreviews() {
    references.value.forEach((reference) => URL.revokeObjectURL(reference.previewUrl));
    references.value = [];
}
function removeReference(key) {
    const reference = references.value.find((item) => item.key === key);
    if (reference)
        URL.revokeObjectURL(reference.previewUrl);
    references.value = references.value.filter((item) => item.key !== key);
}
function applyCapabilityDefaults() {
    const capability = currentCapability.value;
    selectedModel.value = capability?.models[0]?.value || "";
    selectedSize.value = capability?.sizes[0]?.value || "";
    selectedQuality.value = capability?.qualities[0]?.value || "";
    selectedDuration.value = Number(capability?.durations?.[0]?.value || 5);
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
        const nextWorks = page.items.slice(0, 8);
        const refunded = nextWorks.some((work) => work.status === "failed" && recentWorks.value.find((current) => current.id === work.id)?.status === "generating");
        recentWorks.value = nextWorks;
        if (refunded)
            void authStore.refreshPointsBalance();
        void loadRecentPreviewUrls(nextWorks, sequence);
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
        const thumbnailURL = work.type === "image" ? `${work.url}${work.url.includes("?") ? "&" : "?"}thumbnail=1` : work.url;
        try {
            const blob = await assetApi.getAssetContent(thumbnailURL);
            return { id: work.id, url: URL.createObjectURL(blob), signature, created: true };
        }
        catch {
            if (work.type === "image") {
                try {
                    const original = await assetApi.getAssetContent(work.url);
                    return { id: work.id, url: URL.createObjectURL(original), signature, created: true };
                }
                catch { /* leave this card in its fallback state */ }
            }
            return { id: work.id, url: "", signature: "", created: false };
        }
    }));
    if (sequence !== recentLoadSequence) {
        entries.forEach((entry) => entry.created && entry.url && URL.revokeObjectURL(entry.url));
        return;
    }
    const nextUrls = Object.fromEntries(entries.map((entry) => [entry.id, entry.url]));
    Object.entries(existingUrls).forEach(([id, url]) => {
        if (url && nextUrls[id] !== url)
            URL.revokeObjectURL(url);
    });
    recentPreviewUrls.value = nextUrls;
    recentPreviewSignatures.value = Object.fromEntries(entries.map((entry) => [entry.id, entry.signature]));
}
async function loadModels() {
    modelsLoading.value = true;
    try {
        const [images, videos] = await Promise.all([listImageModels(), listVideoModels()]);
        capabilities.value.image.models = images.map((model) => ({ value: model.id, label: model.displayName }));
        capabilities.value.video.models = videos.map((model) => ({ value: model.id, label: model.displayName }));
        capabilities.value.video.enabled = videos.length > 0;
        const current = activeType.value === "video" ? videos : images;
        if (!current.some((model) => model.id === selectedModel.value))
            selectedModel.value = current[0]?.id || "";
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
async function openRecent(work) {
    if (work.status !== "ready" || !recentPreviewUrls.value[work.id])
        return;
    closeRecent();
    selectedRecent.value = work;
    recentDetailUrl.value = recentPreviewUrls.value[work.id];
    if (work.type !== "image")
        return;
    try {
        const original = await assetApi.getAssetContent(work.url);
        const objectUrl = URL.createObjectURL(original);
        if (selectedRecent.value?.id !== work.id) {
            URL.revokeObjectURL(objectUrl);
            return;
        }
        recentDetailObjectUrl = objectUrl;
        recentDetailUrl.value = objectUrl;
    }
    catch {
        // Keep the authenticated thumbnail visible if the original cannot be loaded.
    }
}
function closeRecent() {
    if (recentDetailObjectUrl)
        URL.revokeObjectURL(recentDetailObjectUrl);
    recentDetailObjectUrl = "";
    recentDetailUrl.value = "";
    selectedRecent.value = null;
}
function useSameParameters(asset, notify = true) {
    const task = asset.generation;
    if (!task || (asset.type !== "image" && asset.type !== "video"))
        return;
    clearReferencePreviews();
    activeType.value = asset.type;
    prompt.value = task.prompt;
    const capability = capabilities.value[asset.type];
    selectedModel.value = capability.models.some((option) => option.value === task.model) ? task.model : capability.models[0]?.value || "";
    selectedSize.value = capability.sizes.some((option) => option.value === task.ratio) ? task.ratio : capability.sizes[0]?.value || "";
    selectedQuality.value = capability.qualities.some((option) => option.value === task.quality) ? task.quality : capability.qualities[0]?.value || "";
    selectedCount.value = 1;
    if (asset.type === "video") {
        selectedDuration.value = task.requestedDurationSeconds || 5;
        soundEnabled.value = task.soundEnabled;
        watermarkEnabled.value = task.watermarkEnabled;
        videoMode.value = task.videoMode === "frames" || task.videoMode === "reference" ? task.videoMode : "text";
    }
    closeRecent();
    document.querySelector(".page-scroll")?.scrollTo({ top: 0, behavior: "smooth" });
    if (notify)
        notification.success("同款参数已回填，可继续修改后生成");
}
function restoreSameParameters() {
    const raw = sessionStorage.getItem(sameParametersStorageKey);
    if (!raw)
        return;
    sessionStorage.removeItem(sameParametersStorageKey);
    try {
        useSameParameters(JSON.parse(raw));
    }
    catch {
        notification.warning("同款参数恢复失败");
    }
}
function recentMeta(work) {
    if (work.status === "generating")
        return "生成中";
    if (work.status === "failed")
        return "生成失败";
    if (work.status === "needs_review")
        return "等待确认";
    if (work.type === "video" && work.durationSeconds !== undefined) {
        const minutes = Math.floor(work.durationSeconds / 60);
        const seconds = Math.floor(work.durationSeconds % 60);
        return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    }
    return work.width > 0 && work.height > 0 ? `${work.width}×${work.height}` : "已完成";
}
onMounted(async () => {
    await Promise.all([loadModels(), loadRecentWorks()]);
    restoreSameParameters();
    if ("requestIdleCallback" in window)
        heroIdleHandle = window.requestIdleCallback(() => (showHeroBackdrop.value = true));
    else
        requestAnimationFrame(() => (showHeroBackdrop.value = true));
});
onBeforeUnmount(() => {
    if (heroIdleHandle !== undefined && "cancelIdleCallback" in window)
        window.cancelIdleCallback(heroIdleHandle);
    pauseRecentRefresh();
    clearReferencePreviews();
    closeRecent();
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
__VLS_withDotValue(videoMode, {});
// @ts-ignore
__VLS_withDotValue(references, {});
// @ts-ignore
__VLS_withDotValue(modelsLoading, {});
// @ts-ignore
__VLS_withDotValue(currentCapability, {});
// @ts-ignore
__VLS_withDotValue(soundEnabled, {});
// @ts-ignore
__VLS_withDotValue(watermarkEnabled, {});
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
// @ts-ignore
__VLS_withDotValue(selectedRecent, {});
// @ts-ignore
__VLS_withDotValue(recentDetailUrl, {});
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
    ...{ class: ({ 'composer__body--reference': activeType.value === 'video' && videoMode.value === 'reference' }) },
});
/** @type {__VLS_StyleScopedClasses['composer__body']} */ ;
/** @type {__VLS_StyleScopedClasses['composer__body--reference']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "reference-slot" },
    ...{ class: ({ 'reference-slot--selected': references.value.length }) },
});
/** @type {__VLS_StyleScopedClasses['reference-slot']} */ ;
/** @type {__VLS_StyleScopedClasses['reference-slot--selected']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.input)({
    ...{ onChange: (selectReference) },
    ref: "referenceInput",
    ...{ class: "reference-slot__input" },
    type: "file",
    accept: (__VLS_unwrap(referenceAccept, {})),
    multiple: true,
});
/** @type {__VLS_StyleScopedClasses['reference-slot__input']} */ ;
if (activeType.value === 'video' && videoMode.value === 'text') {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "reference-slot__pick reference-slot__pick--static" },
    });
    /** @type {__VLS_StyleScopedClasses['reference-slot__pick']} */ ;
    /** @type {__VLS_StyleScopedClasses['reference-slot__pick--static']} */ ;
    let __VLS_21;
    /** @ts-ignore @type { | typeof __VLS_components.Type} */
    Type;
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
    (__VLS_unwrap(referenceHint, {}));
}
else if (!references.value.length) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (chooseReference) },
        ...{ class: "reference-slot__pick" },
        type: "button",
        'aria-label': "添加参考素材",
    });
    /** @type {__VLS_StyleScopedClasses['reference-slot__pick']} */ ;
    let __VLS_26;
    /** @ts-ignore @type { | typeof __VLS_components.Paperclip} */
    Paperclip;
    // @ts-ignore
    const __VLS_27 = __VLS_asFunctionalComponent1(__VLS_26, new __VLS_26({
        // @ts-ignore
        size: (21),
    }));
    const __VLS_28 = __VLS_27({
        size: (21),
    }, ...__VLS_functionalComponentArgsRest(__VLS_27));
    __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    (__VLS_unwrap(referenceHint, {}));
}
else {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "reference-slot__grid" },
    });
    /** @type {__VLS_StyleScopedClasses['reference-slot__grid']} */ ;
    const __VLS_31 = __VLS_tryAsConstant((references.value));
    for (const [reference] of __VLS_vFor(__VLS_nonNull(__VLS_31))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            key: (reference.key),
            ...{ class: "reference-slot__thumb" },
        });
        /** @type {__VLS_StyleScopedClasses['reference-slot__thumb']} */ ;
        if (reference.kind === 'image') {
            __VLS_asFunctionalElement1(__VLS_intrinsics.img)({
                src: (reference.previewUrl),
                alt: (reference.file.name),
            });
        }
        else if (reference.kind === 'video') {
            __VLS_asFunctionalElement1(__VLS_intrinsics.video)({
                src: (reference.previewUrl),
                muted: true,
                preload: "metadata",
                'aria-hidden': "true",
            });
        }
        else {
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "reference-slot__audio" },
            });
            /** @type {__VLS_StyleScopedClasses['reference-slot__audio']} */ ;
            let __VLS_32;
            /** @ts-ignore @type { | typeof __VLS_components.Music} */
            Music;
            // @ts-ignore
            const __VLS_33 = __VLS_asFunctionalComponent1(__VLS_32, new __VLS_32({
                // @ts-ignore
                size: (17),
            }));
            const __VLS_34 = __VLS_33({
                size: (17),
            }, ...__VLS_functionalComponentArgsRest(__VLS_33));
            __VLS_asFunctionalElement1(__VLS_intrinsics.small, __VLS_intrinsics.small)({});
            (reference.file.name);
        }
        if (videoMode.value === 'frames') {
            __VLS_asFunctionalElement1(__VLS_intrinsics.em, __VLS_intrinsics.em)({
                ...{ class: "reference-slot__role" },
            });
            /** @type {__VLS_StyleScopedClasses['reference-slot__role']} */ ;
            (reference.role === 'first_frame' ? '首帧' : '尾帧');
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: // @ts-ignore
                (...[$event]) => {
                    void $event;
                    if (!!(activeType.value === 'video' && videoMode.value === 'text'))
                        throw 0;
                    if (!!(!references.value.length))
                        throw 0;
                    return (removeReference(reference.key));
                    // @ts-ignore
                    [activeType, activeType, videoMode, videoMode, videoMode, references, references, references, referenceAccept, referenceHint, referenceHint,];
                } },
            type: "button",
            'aria-label': "移除参考素材",
            title: "移除参考素材",
        });
        let __VLS_37;
        /** @ts-ignore @type { | typeof __VLS_components.X} */
        X;
        // @ts-ignore
        const __VLS_38 = __VLS_asFunctionalComponent1(__VLS_37, new __VLS_37({
            // @ts-ignore
            size: (12),
        }));
        const __VLS_39 = __VLS_38({
            size: (12),
        }, ...__VLS_functionalComponentArgsRest(__VLS_38));
        // @ts-ignore
        [];
    }
    if (references.value.length < __VLS_unwrap(referenceLimit, {})) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (chooseReference) },
            ...{ class: "reference-slot__add" },
            type: "button",
            'aria-label': "继续添加参考素材",
        });
        /** @type {__VLS_StyleScopedClasses['reference-slot__add']} */ ;
        let __VLS_42;
        /** @ts-ignore @type { | typeof __VLS_components.Plus} */
        Plus;
        // @ts-ignore
        const __VLS_43 = __VLS_asFunctionalComponent1(__VLS_42, new __VLS_42({
            // @ts-ignore
            size: (18),
        }));
        const __VLS_44 = __VLS_43({
            size: (18),
        }, ...__VLS_functionalComponentArgsRest(__VLS_43));
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
        (references.value.length);
        (__VLS_unwrap(referenceLimit, {}));
    }
}
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
const __VLS_47 = __VLS_tryAsConstant((currentCapability.value?.models || []));
for (const [option] of __VLS_vFor(__VLS_nonNull(__VLS_47))) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
        key: (option.value),
        value: (option.value),
    });
    (option.label);
    // @ts-ignore
    [references, references, referenceLimit, referenceLimit, prompt, promptPlaceholder, selectedModel, modelsLoading, modelsLoading, currentCapability, currentCapability, currentCapability,];
}
let __VLS_48;
/** @ts-ignore @type { | typeof __VLS_components.ChevronDown} */
ChevronDown;
// @ts-ignore
const __VLS_49 = __VLS_asFunctionalComponent1(__VLS_48, new __VLS_48({
    // @ts-ignore
    size: (14),
}));
const __VLS_50 = __VLS_49({
    size: (14),
}, ...__VLS_functionalComponentArgsRest(__VLS_49));
if (activeType.value === 'video') {
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
        ...{ class: "compact-select compact-select--mode" },
    });
    /** @type {__VLS_StyleScopedClasses['compact-select']} */ ;
    /** @type {__VLS_StyleScopedClasses['compact-select--mode']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.select, __VLS_intrinsics.select)({
        ...{ onChange: (changeVideoMode) },
        value: (videoMode.value),
        'aria-label': "视频生成模式",
    });
    const __VLS_53 = __VLS_tryAsConstant((__VLS_unwrap(videoModes, {})));
    for (const [mode] of __VLS_vFor(__VLS_nonNull(__VLS_53))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
            key: (mode.value),
            value: (mode.value),
        });
        (mode.label);
        // @ts-ignore
        [activeType, videoMode, videoModes,];
    }
    let __VLS_54;
    /** @ts-ignore @type { | typeof __VLS_components.ChevronDown} */
    ChevronDown;
    // @ts-ignore
    const __VLS_55 = __VLS_asFunctionalComponent1(__VLS_54, new __VLS_54({
        // @ts-ignore
        size: (14),
    }));
    const __VLS_56 = __VLS_55({
        size: (14),
    }, ...__VLS_functionalComponentArgsRest(__VLS_55));
}
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
const __VLS_59 = __VLS_tryAsConstant((currentCapability.value?.sizes || []));
for (const [option] of __VLS_vFor(__VLS_nonNull(__VLS_59))) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
        key: (option.value),
        value: (option.value),
    });
    (option.label);
    // @ts-ignore
    [currentCapability, currentCapability, selectedSize,];
}
let __VLS_60;
/** @ts-ignore @type { | typeof __VLS_components.ChevronDown} */
ChevronDown;
// @ts-ignore
const __VLS_61 = __VLS_asFunctionalComponent1(__VLS_60, new __VLS_60({
    // @ts-ignore
    size: (14),
}));
const __VLS_62 = __VLS_61({
    size: (14),
}, ...__VLS_functionalComponentArgsRest(__VLS_61));
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
const __VLS_65 = __VLS_tryAsConstant((currentCapability.value?.qualities || []));
for (const [option] of __VLS_vFor(__VLS_nonNull(__VLS_65))) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
        key: (option.value),
        value: (option.value),
    });
    (option.label);
    // @ts-ignore
    [currentCapability, currentCapability, selectedQuality,];
}
let __VLS_66;
/** @ts-ignore @type { | typeof __VLS_components.ChevronDown} */
ChevronDown;
// @ts-ignore
const __VLS_67 = __VLS_asFunctionalComponent1(__VLS_66, new __VLS_66({
    // @ts-ignore
    size: (14),
}));
const __VLS_68 = __VLS_67({
    size: (14),
}, ...__VLS_functionalComponentArgsRest(__VLS_67));
if (activeType.value === 'image') {
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
        ...{ class: "compact-select compact-select--count" },
    });
    /** @type {__VLS_StyleScopedClasses['compact-select']} */ ;
    /** @type {__VLS_StyleScopedClasses['compact-select--count']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.select, __VLS_intrinsics.select)({
        value: (__VLS_unwrap(selectedCount, {})),
        'aria-label': "生成张数",
        disabled: (!currentCapability.value?.enabled),
    });
    const __VLS_71 = __VLS_tryAsConstant((4));
    for (const [count] of __VLS_vFor(__VLS_nonNull(__VLS_71))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
            key: (count),
            value: (count),
        });
        (count);
        // @ts-ignore
        [activeType, currentCapability, selectedCount,];
    }
    let __VLS_72;
    /** @ts-ignore @type { | typeof __VLS_components.ChevronDown} */
    ChevronDown;
    // @ts-ignore
    const __VLS_73 = __VLS_asFunctionalComponent1(__VLS_72, new __VLS_72({
        // @ts-ignore
        size: (14),
    }));
    const __VLS_74 = __VLS_73({
        size: (14),
    }, ...__VLS_functionalComponentArgsRest(__VLS_73));
}
else {
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
        ...{ class: "compact-select compact-select--count" },
    });
    /** @type {__VLS_StyleScopedClasses['compact-select']} */ ;
    /** @type {__VLS_StyleScopedClasses['compact-select--count']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.select, __VLS_intrinsics.select)({
        value: (__VLS_unwrap(selectedDuration, {})),
        'aria-label': "视频时长",
        disabled: (!currentCapability.value?.enabled),
    });
    const __VLS_77 = __VLS_tryAsConstant((currentCapability.value?.durations || []));
    for (const [option] of __VLS_vFor(__VLS_nonNull(__VLS_77))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
            key: (option.value),
            value: (Number(option.value)),
        });
        (option.label);
        // @ts-ignore
        [currentCapability, currentCapability, selectedDuration,];
    }
    let __VLS_78;
    /** @ts-ignore @type { | typeof __VLS_components.ChevronDown} */
    ChevronDown;
    // @ts-ignore
    const __VLS_79 = __VLS_asFunctionalComponent1(__VLS_78, new __VLS_78({
        // @ts-ignore
        size: (14),
    }));
    const __VLS_80 = __VLS_79({
        size: (14),
    }, ...__VLS_functionalComponentArgsRest(__VLS_79));
}
if (activeType.value === 'video') {
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
        ...{ class: "compact-toggle" },
    });
    /** @type {__VLS_StyleScopedClasses['compact-toggle']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        type: "checkbox",
    });
    (soundEnabled.value);
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    (soundEnabled.value ? "有声音" : "无声音");
}
if (activeType.value === 'video') {
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
        ...{ class: "compact-toggle" },
    });
    /** @type {__VLS_StyleScopedClasses['compact-toggle']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        type: "checkbox",
    });
    (watermarkEnabled.value);
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    (watermarkEnabled.value ? "有水印" : "无水印");
}
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (startCreation) },
    ...{ class: "create-button" },
    type: "button",
    disabled: (creating.value || modelsLoading.value || !selectedModel.value),
});
/** @type {__VLS_StyleScopedClasses['create-button']} */ ;
if (creating.value) {
    let __VLS_83;
    /** @ts-ignore @type { | typeof __VLS_components.LoaderCircle} */
    LoaderCircle;
    // @ts-ignore
    const __VLS_84 = __VLS_asFunctionalComponent1(__VLS_83, new __VLS_83({
        // @ts-ignore
        ...{ class: "spin" }, size: (18),
    }));
    const __VLS_85 = __VLS_84({
        ...{ class: "spin" },
        size: (18),
    }, ...__VLS_functionalComponentArgsRest(__VLS_84));
    /** @type {__VLS_StyleScopedClasses['spin']} */ ;
}
else {
    let __VLS_88;
    /** @ts-ignore @type { | typeof __VLS_components.Sparkles} */
    Sparkles;
    // @ts-ignore
    const __VLS_89 = __VLS_asFunctionalComponent1(__VLS_88, new __VLS_88({
        // @ts-ignore
        size: (18),
    }));
    const __VLS_90 = __VLS_89({
        size: (18),
    }, ...__VLS_functionalComponentArgsRest(__VLS_89));
}
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
(creating.value ? "提交中" : "开始生成");
let __VLS_93;
/** @ts-ignore @type { | typeof __VLS_components.ArrowRight} */
ArrowRight;
// @ts-ignore
const __VLS_94 = __VLS_asFunctionalComponent1(__VLS_93, new __VLS_93({
    // @ts-ignore
    size: (17),
}));
const __VLS_95 = __VLS_94({
    size: (17),
}, ...__VLS_functionalComponentArgsRest(__VLS_94));
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
let __VLS_98;
/** @ts-ignore @type { | typeof __VLS_components.Clock3} */
Clock3;
// @ts-ignore
const __VLS_99 = __VLS_asFunctionalComponent1(__VLS_98, new __VLS_98({
    // @ts-ignore
    size: (16),
}));
const __VLS_100 = __VLS_99({
    size: (16),
}, ...__VLS_functionalComponentArgsRest(__VLS_99));
__VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: // @ts-ignore
        (...[$event]) => {
            void $event;
            return (router.value.push('/assets'));
            // @ts-ignore
            [activeType, activeType, selectedModel, modelsLoading, soundEnabled, soundEnabled, watermarkEnabled, watermarkEnabled, creating, creating, creating, router,];
        } },
    type: "button",
});
let __VLS_103;
/** @ts-ignore @type { | typeof __VLS_components.ArrowRight} */
ArrowRight;
// @ts-ignore
const __VLS_104 = __VLS_asFunctionalComponent1(__VLS_103, new __VLS_103({
    // @ts-ignore
    size: (15),
}));
const __VLS_105 = __VLS_104({
    size: (15),
}, ...__VLS_functionalComponentArgsRest(__VLS_104));
if (recentLoading.value) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "media-grid media-grid--recent" },
        'aria-label': "正在加载最近创作",
    });
    /** @type {__VLS_StyleScopedClasses['media-grid']} */ ;
    /** @type {__VLS_StyleScopedClasses['media-grid--recent']} */ ;
    const __VLS_108 = __VLS_tryAsConstant((8));
    for (const [index] of __VLS_vFor(__VLS_nonNull(__VLS_108))) {
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
    const __VLS_109 = __VLS_tryAsConstant((recentWorks.value));
    for (const [work] of __VLS_vFor(__VLS_nonNull(__VLS_109))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: // @ts-ignore
                (...[$event]) => {
                    void $event;
                    if (!!(recentLoading.value))
                        throw 0;
                    if (!(recentWorks.value.length))
                        throw 0;
                    return (openRecent(work));
                    // @ts-ignore
                    [recentWorks, recentWorks,];
                } },
            key: (work.id),
            type: "button",
            ...{ class: "media-tile" },
            disabled: (work.status !== 'ready' || !recentPreviewUrls.value[work.id]),
        });
        /** @type {__VLS_StyleScopedClasses['media-tile']} */ ;
        if (recentPreviewUrls.value[work.id] && work.type === 'image') {
            __VLS_asFunctionalElement1(__VLS_intrinsics.img)({
                src: (recentPreviewUrls.value[work.id]),
                alt: (work.title),
                loading: "lazy",
                decoding: "async",
            });
        }
        else if (recentPreviewUrls.value[work.id]) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.video)({
                src: (recentPreviewUrls.value[work.id]),
                muted: true,
                playsinline: true,
                preload: "metadata",
                'aria-hidden': "true",
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
            let __VLS_110;
            /** @ts-ignore @type { | typeof __VLS_components.Play} */
            Play;
            // @ts-ignore
            const __VLS_111 = __VLS_asFunctionalComponent1(__VLS_110, new __VLS_110({
                // @ts-ignore
                size: (16), fill: "currentColor",
            }));
            const __VLS_112 = __VLS_111({
                size: (16),
                fill: "currentColor",
            }, ...__VLS_functionalComponentArgsRest(__VLS_111));
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
        [recentPreviewUrls, recentPreviewUrls, recentPreviewUrls, recentPreviewUrls, recentPreviewUrls,];
    }
}
else {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "recent-empty" },
    });
    /** @type {__VLS_StyleScopedClasses['recent-empty']} */ ;
}
if (selectedRecent.value && recentDetailUrl.value) {
    const __VLS_115 = AssetPreviewDialog;
    // @ts-ignore
    const __VLS_116 = __VLS_asFunctionalComponent1(__VLS_115, new __VLS_115({
        // @ts-ignore
        ...{ 'onClose': {} }, ...{ 'onRecreate': {} }, asset: (selectedRecent.value), mediaUrl: (recentDetailUrl.value),
    }));
    const __VLS_117 = __VLS_116({
        ...{ 'onClose': {} },
        ...{ 'onRecreate': {} },
        asset: (selectedRecent.value),
        mediaUrl: (recentDetailUrl.value),
    }, ...__VLS_functionalComponentArgsRest(__VLS_116));
    let __VLS_120;
    const __VLS_121 = {
        /** @type {typeof __VLS_120.close} */
        onClose: (closeRecent),
    };
    void __VLS_121;
    const __VLS_122 = {
        /** @type {typeof __VLS_120.recreate} */
        onRecreate: (useSameParameters),
    };
    void __VLS_122;
    var __VLS_118;
    var __VLS_119;
}
// @ts-ignore
[selectedRecent, selectedRecent, recentDetailUrl, recentDetailUrl,];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
