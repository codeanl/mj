import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { useIntervalFn } from "@vueuse/core";
import { ArrowRight, Bell, ChevronDown, Clock3, Image, FolderOpen, LoaderCircle, Music, Moon, Paperclip, Play, Plus, Sparkles, Sun, Type, Video, X, } from "@lucide/vue";
import { useAuthStore } from "@/stores/auth";
import AssetPreviewDialog from "@/components/AssetPreviewDialog.vue";
import UserAvatar from "@/components/UserAvatar.vue";
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
const videoCatalog = ref([]);
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
const referencePickerOpen = ref(false);
const referencePickerLoading = ref(false);
const referencePickerAssets = ref([]);
const referencePickerUrls = ref({});
const darkMode = ref(false);
const creating = ref(false);
const pendingRequestId = ref("");
const pendingRequestSignature = ref("");
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
const selectedVideoProfile = computed(() => videoCatalog.value.find((model) => model.id === selectedModel.value)?.capabilityConfig);
const videoModes = [
    { value: "text", label: "文生视频" },
    { value: "frames", label: "首尾帧" },
    { value: "reference", label: "全能参考" },
    { value: "extend", label: "视频延长" },
    { value: "lip_sync", label: "对口型" },
    { value: "edit", label: "视频编辑" },
    { value: "motion_transfer", label: "动作迁移" },
];
const availableVideoModes = computed(() => {
    const allowed = selectedVideoProfile.value?.modes;
    return !allowed?.length ? videoModes.slice(0, 3) : videoModes.filter((mode) => allowed.includes(mode.value));
});
const referenceLimit = computed(() => activeType.value === "image" ? 3 : videoMode.value === "frames" ? 2 : videoMode.value === "reference" ? 12 : videoMode.value === "text" ? 0 : 12);
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
    if (videoMode.value === "extend")
        return "选择需要延长的视频";
    if (videoMode.value === "lip_sync")
        return "选择视频和音频";
    if (videoMode.value === "edit")
        return "选择需要编辑的视频";
    if (videoMode.value === "motion_transfer")
        return "选择人物图片和动作视频";
    return "无需上传素材";
});
const hasGeneratingRecentWorks = computed(() => recentWorks.value.some((work) => work.status === "generating"));
const refreshInterval = Number(import.meta.env.VITE_GENERATION_REFRESH_INTERVAL_MS || 3000);
const { pause: pauseRecentRefresh, resume: resumeRecentRefresh } = useIntervalFn(() => {
    if (!recentLoading.value && !recentRefreshing.value && hasGeneratingRecentWorks.value)
        void loadRecentWorks({ silent: true });
}, Number.isFinite(refreshInterval) && refreshInterval > 0 ? refreshInterval : 3000, { immediate: false });
watch(hasGeneratingRecentWorks, (hasGenerating) => (hasGenerating ? resumeRecentRefresh() : pauseRecentRefresh()), { immediate: true });
watch(selectedVideoProfile, (profile) => {
    if (!profile || activeType.value !== "video")
        return;
    const ratios = profile.ratios || [];
    const qualities = profile.qualities || [];
    capabilities.value.video.sizes = ratios.map((value) => ({ value, label: value === "adaptive" ? "自适应" : value, width: 0, height: 0 }));
    capabilities.value.video.qualities = qualities.map((value) => ({ value, label: value }));
    const min = profile.minDuration || 4, max = profile.maxDuration || 30;
    capabilities.value.video.durations = Array.from({ length: max - min + 1 }, (_, index) => ({ value: String(min + index), label: `${min + index}秒` }));
    if (!ratios.includes(selectedSize.value))
        selectedSize.value = ratios[0] || "";
    if (!qualities.includes(selectedQuality.value))
        selectedQuality.value = qualities[0] || "";
    if (selectedDuration.value < min || selectedDuration.value > max)
        selectedDuration.value = min;
    if (!availableVideoModes.value.some((mode) => mode.value === videoMode.value))
        selectVideoMode(availableVideoModes.value[0]?.value || "text");
    if (!profile.supportsSound)
        soundEnabled.value = false;
    if (!profile.supportsWatermark)
        watermarkEnabled.value = false;
}, { immediate: true });
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
    if (activeType.value === "video" && videoMode.value === "lip_sync" && (!references.value.some((item) => item.kind === "video") || !references.value.some((item) => item.kind === "audio"))) {
        notification.info("对口型需要同时选择视频和音频");
        return;
    }
    if (activeType.value === "video" && ["extend", "edit"].includes(videoMode.value) && !references.value.some((item) => item.kind === "video")) {
        notification.info("请选择一个视频素材");
        return;
    }
    if (activeType.value === "video" && videoMode.value === "motion_transfer" && (!references.value.some((item) => item.kind === "video") || !references.value.some((item) => item.kind === "image"))) {
        notification.info("动作迁移需要人物图片和动作视频");
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
            if (!reference.file)
                throw new Error("参考素材文件不存在");
            const uploaded = await assetApi.uploadAsset(reference.file, "创作参考素材");
            reference.assetId = uploaded.id;
        }));
        const referenceAssetIds = references.value.map((reference) => reference.assetId);
        const videoReferences = references.value.map((reference) => ({ assetId: reference.assetId, role: reference.role }));
        const requestSignature = JSON.stringify({ type: activeType.value, prompt: submittedPrompt, model: selectedModel.value, size: selectedSize.value, quality: selectedQuality.value, count: selectedCount.value, duration: selectedDuration.value, sound: soundEnabled.value, watermark: watermarkEnabled.value, mode: videoMode.value, references: activeType.value === "video" ? videoReferences : referenceAssetIds });
        if (!pendingRequestId.value || pendingRequestSignature.value !== requestSignature) {
            pendingRequestId.value = crypto.randomUUID();
            pendingRequestSignature.value = requestSignature;
        }
        const requestId = pendingRequestId.value;
        const batch = activeType.value === "video" ? await createVideoGeneration({ requestId, prompt: submittedPrompt, model: selectedModel.value, size: selectedSize.value, quality: selectedQuality.value, durationSeconds: selectedDuration.value, soundEnabled: soundEnabled.value, watermarkEnabled: watermarkEnabled.value, mode: videoMode.value, ...(videoReferences.length ? { references: videoReferences } : {}) }) : await createImageGeneration({
            requestId,
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
        pendingRequestId.value = "";
        pendingRequestSignature.value = "";
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
function openReferencePicker() {
    if (referenceLimit.value <= 0)
        return;
    referencePickerOpen.value = true;
    void loadReferencePickerAssets();
}
function chooseReference() {
    closeReferencePicker();
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
        references.value.push({ key, file, name: file.name, previewUrl: URL.createObjectURL(file), previewIsImage: kind === "image", assetId: "", kind, role: roleForReference(kind) });
    }
    if (rejected)
        notification.warning(activeType.value === "image" ? "最多添加 3 张 JPG、PNG 或 WebP 参考图" : videoMode.value === "frames" ? "首尾帧只能添加最多 2 张图片" : "全能参考最多 9 张图片、3 个视频、3 个音频，总计 12 个");
}
function clearReferencePreviews() {
    references.value.forEach((reference) => reference.previewUrl && URL.revokeObjectURL(reference.previewUrl));
    references.value = [];
}
function removeReference(key) {
    const reference = references.value.find((item) => item.key === key);
    if (reference?.previewUrl)
        URL.revokeObjectURL(reference.previewUrl);
    references.value = references.value.filter((item) => item.key !== key);
}
function roleForReference(kind) {
    if (activeType.value === "image")
        return "";
    if (videoMode.value === "frames")
        return references.value.some((reference) => reference.role === "first_frame") ? "last_frame" : "first_frame";
    return kind === "image" ? "reference_image" : kind === "video" ? "reference_video" : "reference_audio";
}
function referenceKindAllowed(kind) {
    if ((activeType.value === "image" || videoMode.value === "frames") && kind !== "image")
        return false;
    if (["extend", "edit"].includes(videoMode.value) && kind !== "video")
        return false;
    if (videoMode.value === "lip_sync" && kind === "image")
        return false;
    if (videoMode.value === "motion_transfer" && kind === "audio")
        return false;
    const maximum = { image: videoMode.value === "reference" ? 9 : referenceLimit.value, video: 3, audio: 3 }[kind];
    return references.value.filter((reference) => reference.kind === kind).length < maximum && references.value.length < referenceLimit.value;
}
async function loadReferencePickerAssets() {
    referencePickerLoading.value = true;
    revokeReferencePickerUrls();
    try {
        const page = await assetApi.listAssets({ page: 1, pageSize: 12, type: activeType.value === "image" || videoMode.value === "frames" ? "image" : undefined });
        referencePickerAssets.value = page.items.filter((asset) => asset.status === "ready" && !references.value.some((reference) => reference.assetId === asset.id) && referenceKindAllowed(asset.type));
        const entries = await Promise.all(referencePickerAssets.value.map(async (asset) => {
            if (asset.type === "audio")
                return [asset.id, ""];
            const source = asset.type === "image" ? `${asset.url}?thumbnail=1` : asset.posterUrl;
            if (!source)
                return [asset.id, ""];
            try {
                const blob = await assetApi.getAssetContent(source);
                return [asset.id, URL.createObjectURL(blob)];
            }
            catch {
                return [asset.id, ""];
            }
        }));
        referencePickerUrls.value = Object.fromEntries(entries);
    }
    catch (error) {
        notification.error(apiErrorMessage(error, "素材库加载失败"));
    }
    finally {
        referencePickerLoading.value = false;
    }
}
function selectExistingReference(asset) {
    if (!referenceKindAllowed(asset.type))
        return;
    const previewUrl = referencePickerUrls.value[asset.id] || "";
    delete referencePickerUrls.value[asset.id];
    references.value.push({ key: `asset:${asset.id}`, name: asset.title, previewUrl, previewIsImage: asset.type !== "audio", assetId: asset.id, kind: asset.type, role: roleForReference(asset.type) });
    closeReferencePicker();
}
function revokeReferencePickerUrls() {
    Object.values(referencePickerUrls.value).forEach((url) => url && URL.revokeObjectURL(url));
    referencePickerUrls.value = {};
}
function closeReferencePicker() {
    referencePickerOpen.value = false;
    revokeReferencePickerUrls();
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
        const thumbnailURL = work.type === "image" ? `${work.url}${work.url.includes("?") ? "&" : "?"}thumbnail=1` : work.posterUrl || work.url;
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
        videoCatalog.value = videos;
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
    if (work.type === "audio")
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
async function useSameParameters(asset, notify = true) {
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
        videoMode.value = availableVideoModes.value.some((mode) => mode.value === task.videoMode) ? task.videoMode : "text";
    }
    const taskReferences = task.references || [];
    const restored = await Promise.all(taskReferences.map(async (reference) => {
        let previewUrl = "";
        if (reference.type === "image") {
            try {
                const blob = await assetApi.getAssetContent(`${reference.url}${reference.url.includes("?") ? "&" : "?"}thumbnail=1`);
                previewUrl = URL.createObjectURL(blob);
            }
            catch { /* keep icon fallback */ }
        }
        return { key: `asset:${reference.assetId}`, name: reference.title, previewUrl, previewIsImage: reference.type === "image", assetId: reference.assetId, kind: reference.type, role: (asset.type === "image" ? "" : reference.role) };
    }));
    references.value = restored;
    closeRecent();
    document.querySelector(".page-scroll")?.scrollTo({ top: 0, behavior: "smooth" });
    if (notify)
        notification.success("同款参数已回填，可继续修改后生成");
}
async function restoreSameParameters() {
    const raw = sessionStorage.getItem(sameParametersStorageKey);
    if (!raw)
        return;
    sessionStorage.removeItem(sameParametersStorageKey);
    try {
        await useSameParameters(JSON.parse(raw));
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
    await restoreSameParameters();
    if ("requestIdleCallback" in window)
        heroIdleHandle = window.requestIdleCallback(() => (showHeroBackdrop.value = true));
    else
        requestAnimationFrame(() => (showHeroBackdrop.value = true));
});
onBeforeUnmount(() => {
    if (heroIdleHandle !== undefined && "cancelIdleCallback" in window)
        window.cancelIdleCallback(heroIdleHandle);
    pauseRecentRefresh();
    closeReferencePicker();
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
__VLS_withDotValue(router, {});
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
__VLS_withDotValue(selectedVideoProfile, {});
// @ts-ignore
__VLS_withDotValue(soundEnabled, {});
// @ts-ignore
__VLS_withDotValue(watermarkEnabled, {});
// @ts-ignore
__VLS_withDotValue(creating, {});
// @ts-ignore
__VLS_withDotValue(selectedModel, {});
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
// @ts-ignore
__VLS_withDotValue(referencePickerOpen, {});
// @ts-ignore
__VLS_withDotValue(referencePickerLoading, {});
// @ts-ignore
__VLS_withDotValue(referencePickerAssets, {});
// @ts-ignore
__VLS_withDotValue(referencePickerUrls, {});
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
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: // @ts-ignore
        (...[$event]) => {
            void $event;
            return (router.value.push('/profile'));
            // @ts-ignore
            [darkMode, darkMode, router,];
        } },
    ...{ class: "header-avatar" },
    type: "button",
    'aria-label': "个人中心",
});
/** @type {__VLS_StyleScopedClasses['header-avatar']} */ ;
const __VLS_15 = UserAvatar;
// @ts-ignore
const __VLS_16 = __VLS_asFunctionalComponent1(__VLS_15, new __VLS_15({
// @ts-ignore
}));
const __VLS_17 = __VLS_16({}, ...__VLS_functionalComponentArgsRest(__VLS_16));
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
const __VLS_20 = __VLS_tryAsConstant((__VLS_unwrap(creationTypes, {})));
for (const [type] of __VLS_vFor(__VLS_nonNull(__VLS_20))) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: // @ts-ignore
            (...[$event]) => {
                void $event;
                return (selectCreationType(type.id));
                // @ts-ignore
                [creationTypes,];
            } },
        key: (type.id),
        type: "button",
        role: "tab",
        'aria-selected': (activeType.value === type.id),
        ...{ class: ({ 'composer__tab--active': activeType.value === type.id }) },
    });
    /** @type {__VLS_StyleScopedClasses['composer__tab--active']} */ ;
    const __VLS_21 = (type.icon);
    // @ts-ignore
    const __VLS_22 = __VLS_asFunctionalComponent1(__VLS_21, new __VLS_21({
        // @ts-ignore
        size: (17),
    }));
    const __VLS_23 = __VLS_22({
        size: (17),
    }, ...__VLS_functionalComponentArgsRest(__VLS_22));
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
    let __VLS_26;
    /** @ts-ignore @type { | typeof __VLS_components.Type} */
    Type;
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
else if (!references.value.length) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (openReferencePicker) },
        ...{ class: "reference-slot__pick" },
        type: "button",
        'aria-label': "添加参考素材",
    });
    /** @type {__VLS_StyleScopedClasses['reference-slot__pick']} */ ;
    let __VLS_31;
    /** @ts-ignore @type { | typeof __VLS_components.Paperclip} */
    Paperclip;
    // @ts-ignore
    const __VLS_32 = __VLS_asFunctionalComponent1(__VLS_31, new __VLS_31({
        // @ts-ignore
        size: (21),
    }));
    const __VLS_33 = __VLS_32({
        size: (21),
    }, ...__VLS_functionalComponentArgsRest(__VLS_32));
    __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    (__VLS_unwrap(referenceHint, {}));
}
else {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "reference-slot__grid" },
    });
    /** @type {__VLS_StyleScopedClasses['reference-slot__grid']} */ ;
    const __VLS_36 = __VLS_tryAsConstant((references.value));
    for (const [reference] of __VLS_vFor(__VLS_nonNull(__VLS_36))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            key: (reference.key),
            ...{ class: "reference-slot__thumb" },
        });
        /** @type {__VLS_StyleScopedClasses['reference-slot__thumb']} */ ;
        if (reference.previewIsImage && reference.previewUrl) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.img)({
                src: (reference.previewUrl),
                alt: (reference.name),
            });
        }
        else if (reference.kind === 'video' && reference.previewUrl) {
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
            if (reference.kind === 'audio') {
                let __VLS_37;
                /** @ts-ignore @type { | typeof __VLS_components.Music} */
                Music;
                // @ts-ignore
                const __VLS_38 = __VLS_asFunctionalComponent1(__VLS_37, new __VLS_37({
                    // @ts-ignore
                    size: (17),
                }));
                const __VLS_39 = __VLS_38({
                    size: (17),
                }, ...__VLS_functionalComponentArgsRest(__VLS_38));
            }
            else if (reference.kind === 'video') {
                let __VLS_42;
                /** @ts-ignore @type { | typeof __VLS_components.Video} */
                Video;
                // @ts-ignore
                const __VLS_43 = __VLS_asFunctionalComponent1(__VLS_42, new __VLS_42({
                    // @ts-ignore
                    size: (17),
                }));
                const __VLS_44 = __VLS_43({
                    size: (17),
                }, ...__VLS_functionalComponentArgsRest(__VLS_43));
            }
            else {
                let __VLS_47;
                /** @ts-ignore @type { | typeof __VLS_components.Image} */
                Image;
                // @ts-ignore
                const __VLS_48 = __VLS_asFunctionalComponent1(__VLS_47, new __VLS_47({
                    // @ts-ignore
                    size: (17),
                }));
                const __VLS_49 = __VLS_48({
                    size: (17),
                }, ...__VLS_functionalComponentArgsRest(__VLS_48));
            }
            __VLS_asFunctionalElement1(__VLS_intrinsics.small, __VLS_intrinsics.small)({});
            (reference.name);
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
        let __VLS_52;
        /** @ts-ignore @type { | typeof __VLS_components.X} */
        X;
        // @ts-ignore
        const __VLS_53 = __VLS_asFunctionalComponent1(__VLS_52, new __VLS_52({
            // @ts-ignore
            size: (12),
        }));
        const __VLS_54 = __VLS_53({
            size: (12),
        }, ...__VLS_functionalComponentArgsRest(__VLS_53));
        // @ts-ignore
        [];
    }
    if (references.value.length < __VLS_unwrap(referenceLimit, {})) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (openReferencePicker) },
            ...{ class: "reference-slot__add" },
            type: "button",
            'aria-label': "继续添加参考素材",
        });
        /** @type {__VLS_StyleScopedClasses['reference-slot__add']} */ ;
        let __VLS_57;
        /** @ts-ignore @type { | typeof __VLS_components.Plus} */
        Plus;
        // @ts-ignore
        const __VLS_58 = __VLS_asFunctionalComponent1(__VLS_57, new __VLS_57({
            // @ts-ignore
            size: (18),
        }));
        const __VLS_59 = __VLS_58({
            size: (18),
        }, ...__VLS_functionalComponentArgsRest(__VLS_58));
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
const __VLS_62 = __VLS_tryAsConstant((currentCapability.value?.models || []));
for (const [option] of __VLS_vFor(__VLS_nonNull(__VLS_62))) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
        key: (option.value),
        value: (option.value),
    });
    (option.label);
    // @ts-ignore
    [references, references, referenceLimit, referenceLimit, prompt, promptPlaceholder, selectedModel, modelsLoading, modelsLoading, currentCapability, currentCapability, currentCapability,];
}
let __VLS_63;
/** @ts-ignore @type { | typeof __VLS_components.ChevronDown} */
ChevronDown;
// @ts-ignore
const __VLS_64 = __VLS_asFunctionalComponent1(__VLS_63, new __VLS_63({
    // @ts-ignore
    size: (14),
}));
const __VLS_65 = __VLS_64({
    size: (14),
}, ...__VLS_functionalComponentArgsRest(__VLS_64));
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
    const __VLS_68 = __VLS_tryAsConstant((__VLS_unwrap(availableVideoModes, {})));
    for (const [mode] of __VLS_vFor(__VLS_nonNull(__VLS_68))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
            key: (mode.value),
            value: (mode.value),
        });
        (mode.label);
        // @ts-ignore
        [activeType, videoMode, availableVideoModes,];
    }
    let __VLS_69;
    /** @ts-ignore @type { | typeof __VLS_components.ChevronDown} */
    ChevronDown;
    // @ts-ignore
    const __VLS_70 = __VLS_asFunctionalComponent1(__VLS_69, new __VLS_69({
        // @ts-ignore
        size: (14),
    }));
    const __VLS_71 = __VLS_70({
        size: (14),
    }, ...__VLS_functionalComponentArgsRest(__VLS_70));
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
const __VLS_74 = __VLS_tryAsConstant((currentCapability.value?.sizes || []));
for (const [option] of __VLS_vFor(__VLS_nonNull(__VLS_74))) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
        key: (option.value),
        value: (option.value),
    });
    (option.label);
    // @ts-ignore
    [currentCapability, currentCapability, selectedSize,];
}
let __VLS_75;
/** @ts-ignore @type { | typeof __VLS_components.ChevronDown} */
ChevronDown;
// @ts-ignore
const __VLS_76 = __VLS_asFunctionalComponent1(__VLS_75, new __VLS_75({
    // @ts-ignore
    size: (14),
}));
const __VLS_77 = __VLS_76({
    size: (14),
}, ...__VLS_functionalComponentArgsRest(__VLS_76));
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
const __VLS_80 = __VLS_tryAsConstant((currentCapability.value?.qualities || []));
for (const [option] of __VLS_vFor(__VLS_nonNull(__VLS_80))) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
        key: (option.value),
        value: (option.value),
    });
    (option.label);
    // @ts-ignore
    [currentCapability, currentCapability, selectedQuality,];
}
let __VLS_81;
/** @ts-ignore @type { | typeof __VLS_components.ChevronDown} */
ChevronDown;
// @ts-ignore
const __VLS_82 = __VLS_asFunctionalComponent1(__VLS_81, new __VLS_81({
    // @ts-ignore
    size: (14),
}));
const __VLS_83 = __VLS_82({
    size: (14),
}, ...__VLS_functionalComponentArgsRest(__VLS_82));
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
    const __VLS_86 = __VLS_tryAsConstant((4));
    for (const [count] of __VLS_vFor(__VLS_nonNull(__VLS_86))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
            key: (count),
            value: (count),
        });
        (count);
        // @ts-ignore
        [activeType, currentCapability, selectedCount,];
    }
    let __VLS_87;
    /** @ts-ignore @type { | typeof __VLS_components.ChevronDown} */
    ChevronDown;
    // @ts-ignore
    const __VLS_88 = __VLS_asFunctionalComponent1(__VLS_87, new __VLS_87({
        // @ts-ignore
        size: (14),
    }));
    const __VLS_89 = __VLS_88({
        size: (14),
    }, ...__VLS_functionalComponentArgsRest(__VLS_88));
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
    const __VLS_92 = __VLS_tryAsConstant((currentCapability.value?.durations || []));
    for (const [option] of __VLS_vFor(__VLS_nonNull(__VLS_92))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
            key: (option.value),
            value: (Number(option.value)),
        });
        (option.label);
        // @ts-ignore
        [currentCapability, currentCapability, selectedDuration,];
    }
    let __VLS_93;
    /** @ts-ignore @type { | typeof __VLS_components.ChevronDown} */
    ChevronDown;
    // @ts-ignore
    const __VLS_94 = __VLS_asFunctionalComponent1(__VLS_93, new __VLS_93({
        // @ts-ignore
        size: (14),
    }));
    const __VLS_95 = __VLS_94({
        size: (14),
    }, ...__VLS_functionalComponentArgsRest(__VLS_94));
}
if (activeType.value === 'video') {
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
        ...{ class: "compact-toggle" },
        ...{ class: ({ 'is-disabled': selectedVideoProfile.value?.supportsSound === false }) },
    });
    /** @type {__VLS_StyleScopedClasses['compact-toggle']} */ ;
    /** @type {__VLS_StyleScopedClasses['is-disabled']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        type: "checkbox",
        disabled: (selectedVideoProfile.value?.supportsSound === false),
    });
    (soundEnabled.value);
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    (soundEnabled.value ? "有声音" : "无声音");
}
if (activeType.value === 'video') {
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
        ...{ class: "compact-toggle" },
        ...{ class: ({ 'is-disabled': selectedVideoProfile.value?.supportsWatermark === false }) },
    });
    /** @type {__VLS_StyleScopedClasses['compact-toggle']} */ ;
    /** @type {__VLS_StyleScopedClasses['is-disabled']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        type: "checkbox",
        disabled: (selectedVideoProfile.value?.supportsWatermark === false),
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
    let __VLS_98;
    /** @ts-ignore @type { | typeof __VLS_components.LoaderCircle} */
    LoaderCircle;
    // @ts-ignore
    const __VLS_99 = __VLS_asFunctionalComponent1(__VLS_98, new __VLS_98({
        // @ts-ignore
        ...{ class: "spin" }, size: (18),
    }));
    const __VLS_100 = __VLS_99({
        ...{ class: "spin" },
        size: (18),
    }, ...__VLS_functionalComponentArgsRest(__VLS_99));
    /** @type {__VLS_StyleScopedClasses['spin']} */ ;
}
else {
    let __VLS_103;
    /** @ts-ignore @type { | typeof __VLS_components.Sparkles} */
    Sparkles;
    // @ts-ignore
    const __VLS_104 = __VLS_asFunctionalComponent1(__VLS_103, new __VLS_103({
        // @ts-ignore
        size: (18),
    }));
    const __VLS_105 = __VLS_104({
        size: (18),
    }, ...__VLS_functionalComponentArgsRest(__VLS_104));
}
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
(creating.value ? "提交中" : "开始生成");
let __VLS_108;
/** @ts-ignore @type { | typeof __VLS_components.ArrowRight} */
ArrowRight;
// @ts-ignore
const __VLS_109 = __VLS_asFunctionalComponent1(__VLS_108, new __VLS_108({
    // @ts-ignore
    size: (17),
}));
const __VLS_110 = __VLS_109({
    size: (17),
}, ...__VLS_functionalComponentArgsRest(__VLS_109));
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
let __VLS_113;
/** @ts-ignore @type { | typeof __VLS_components.Clock3} */
Clock3;
// @ts-ignore
const __VLS_114 = __VLS_asFunctionalComponent1(__VLS_113, new __VLS_113({
    // @ts-ignore
    size: (16),
}));
const __VLS_115 = __VLS_114({
    size: (16),
}, ...__VLS_functionalComponentArgsRest(__VLS_114));
__VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: // @ts-ignore
        (...[$event]) => {
            void $event;
            return (router.value.push('/assets'));
            // @ts-ignore
            [router, activeType, activeType, selectedModel, modelsLoading, selectedVideoProfile, selectedVideoProfile, selectedVideoProfile, selectedVideoProfile, soundEnabled, soundEnabled, watermarkEnabled, watermarkEnabled, creating, creating, creating,];
        } },
    type: "button",
});
let __VLS_118;
/** @ts-ignore @type { | typeof __VLS_components.ArrowRight} */
ArrowRight;
// @ts-ignore
const __VLS_119 = __VLS_asFunctionalComponent1(__VLS_118, new __VLS_118({
    // @ts-ignore
    size: (15),
}));
const __VLS_120 = __VLS_119({
    size: (15),
}, ...__VLS_functionalComponentArgsRest(__VLS_119));
if (recentLoading.value) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "media-grid media-grid--recent" },
        'aria-label': "正在加载最近创作",
    });
    /** @type {__VLS_StyleScopedClasses['media-grid']} */ ;
    /** @type {__VLS_StyleScopedClasses['media-grid--recent']} */ ;
    const __VLS_123 = __VLS_tryAsConstant((8));
    for (const [index] of __VLS_vFor(__VLS_nonNull(__VLS_123))) {
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
    const __VLS_124 = __VLS_tryAsConstant((recentWorks.value));
    for (const [work] of __VLS_vFor(__VLS_nonNull(__VLS_124))) {
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
        if (recentPreviewUrls.value[work.id] && (work.type === 'image' || work.posterUrl)) {
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
            let __VLS_125;
            /** @ts-ignore @type { | typeof __VLS_components.Play} */
            Play;
            // @ts-ignore
            const __VLS_126 = __VLS_asFunctionalComponent1(__VLS_125, new __VLS_125({
                // @ts-ignore
                size: (16), fill: "currentColor",
            }));
            const __VLS_127 = __VLS_126({
                size: (16),
                fill: "currentColor",
            }, ...__VLS_functionalComponentArgsRest(__VLS_126));
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
    const __VLS_130 = AssetPreviewDialog;
    // @ts-ignore
    const __VLS_131 = __VLS_asFunctionalComponent1(__VLS_130, new __VLS_130({
        // @ts-ignore
        ...{ 'onClose': {} }, ...{ 'onRecreate': {} }, asset: (selectedRecent.value), mediaUrl: (recentDetailUrl.value),
    }));
    const __VLS_132 = __VLS_131({
        ...{ 'onClose': {} },
        ...{ 'onRecreate': {} },
        asset: (selectedRecent.value),
        mediaUrl: (recentDetailUrl.value),
    }, ...__VLS_functionalComponentArgsRest(__VLS_131));
    let __VLS_135;
    const __VLS_136 = {
        /** @type {typeof __VLS_135.close} */
        onClose: (closeRecent),
    };
    void __VLS_136;
    const __VLS_137 = {
        /** @type {typeof __VLS_135.recreate} */
        onRecreate: (useSameParameters),
    };
    void __VLS_137;
    var __VLS_133;
    var __VLS_134;
}
if (referencePickerOpen.value) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ onClick: (closeReferencePicker) },
        ...{ class: "reference-picker" },
        role: "dialog",
        'aria-modal': "true",
        'aria-label': "选择参考素材",
    });
    /** @type {__VLS_StyleScopedClasses['reference-picker']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "reference-picker__panel" },
    });
    /** @type {__VLS_StyleScopedClasses['reference-picker__panel']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.header, __VLS_intrinsics.header)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    (__VLS_unwrap(referenceHint, {}));
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (closeReferencePicker) },
        type: "button",
        title: "关闭",
        'aria-label': "关闭素材选择",
    });
    let __VLS_138;
    /** @ts-ignore @type { | typeof __VLS_components.X} */
    X;
    // @ts-ignore
    const __VLS_139 = __VLS_asFunctionalComponent1(__VLS_138, new __VLS_138({
        // @ts-ignore
        size: (18),
    }));
    const __VLS_140 = __VLS_139({
        size: (18),
    }, ...__VLS_functionalComponentArgsRest(__VLS_139));
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "reference-picker__toolbar" },
    });
    /** @type {__VLS_StyleScopedClasses['reference-picker__toolbar']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (chooseReference) },
        type: "button",
    });
    let __VLS_143;
    /** @ts-ignore @type { | typeof __VLS_components.Paperclip} */
    Paperclip;
    // @ts-ignore
    const __VLS_144 = __VLS_asFunctionalComponent1(__VLS_143, new __VLS_143({
        // @ts-ignore
        size: (15),
    }));
    const __VLS_145 = __VLS_144({
        size: (15),
    }, ...__VLS_functionalComponentArgsRest(__VLS_144));
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    (references.value.length);
    (__VLS_unwrap(referenceLimit, {}));
    if (referencePickerLoading.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "reference-picker__state" },
        });
        /** @type {__VLS_StyleScopedClasses['reference-picker__state']} */ ;
        let __VLS_148;
        /** @ts-ignore @type { | typeof __VLS_components.LoaderCircle} */
        LoaderCircle;
        // @ts-ignore
        const __VLS_149 = __VLS_asFunctionalComponent1(__VLS_148, new __VLS_148({
            // @ts-ignore
            ...{ class: "spin" }, size: (22),
        }));
        const __VLS_150 = __VLS_149({
            ...{ class: "spin" },
            size: (22),
        }, ...__VLS_functionalComponentArgsRest(__VLS_149));
        /** @type {__VLS_StyleScopedClasses['spin']} */ ;
    }
    else if (referencePickerAssets.value.length) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "reference-picker__grid" },
        });
        /** @type {__VLS_StyleScopedClasses['reference-picker__grid']} */ ;
        const __VLS_153 = __VLS_tryAsConstant((referencePickerAssets.value));
        for (const [asset] of __VLS_vFor(__VLS_nonNull(__VLS_153))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: // @ts-ignore
                    (...[$event]) => {
                        void $event;
                        if (!(referencePickerOpen.value))
                            throw 0;
                        if (!!(referencePickerLoading.value))
                            throw 0;
                        if (!(referencePickerAssets.value.length))
                            throw 0;
                        return (selectExistingReference(asset));
                        // @ts-ignore
                        [references, referenceHint, referenceLimit, selectedRecent, selectedRecent, recentDetailUrl, recentDetailUrl, referencePickerOpen, referencePickerLoading, referencePickerAssets, referencePickerAssets,];
                    } },
                key: (asset.id),
                type: "button",
                title: (asset.title),
            });
            if (referencePickerUrls.value[asset.id]) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.img)({
                    src: (referencePickerUrls.value[asset.id]),
                    alt: (asset.title),
                });
            }
            else {
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
                if (asset.type === 'audio') {
                    let __VLS_154;
                    /** @ts-ignore @type { | typeof __VLS_components.Music} */
                    Music;
                    // @ts-ignore
                    const __VLS_155 = __VLS_asFunctionalComponent1(__VLS_154, new __VLS_154({
                        // @ts-ignore
                        size: (22),
                    }));
                    const __VLS_156 = __VLS_155({
                        size: (22),
                    }, ...__VLS_functionalComponentArgsRest(__VLS_155));
                }
                else if (asset.type === 'video') {
                    let __VLS_159;
                    /** @ts-ignore @type { | typeof __VLS_components.Video} */
                    Video;
                    // @ts-ignore
                    const __VLS_160 = __VLS_asFunctionalComponent1(__VLS_159, new __VLS_159({
                        // @ts-ignore
                        size: (22),
                    }));
                    const __VLS_161 = __VLS_160({
                        size: (22),
                    }, ...__VLS_functionalComponentArgsRest(__VLS_160));
                }
                else {
                    let __VLS_164;
                    /** @ts-ignore @type { | typeof __VLS_components.Image} */
                    Image;
                    // @ts-ignore
                    const __VLS_165 = __VLS_asFunctionalComponent1(__VLS_164, new __VLS_164({
                        // @ts-ignore
                        size: (22),
                    }));
                    const __VLS_166 = __VLS_165({
                        size: (22),
                    }, ...__VLS_functionalComponentArgsRest(__VLS_165));
                }
            }
            __VLS_asFunctionalElement1(__VLS_intrinsics.small, __VLS_intrinsics.small)({});
            (asset.title);
            // @ts-ignore
            [referencePickerUrls, referencePickerUrls,];
        }
    }
    else {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "reference-picker__state" },
        });
        /** @type {__VLS_StyleScopedClasses['reference-picker__state']} */ ;
        let __VLS_169;
        /** @ts-ignore @type { | typeof __VLS_components.FolderOpen} */
        FolderOpen;
        // @ts-ignore
        const __VLS_170 = __VLS_asFunctionalComponent1(__VLS_169, new __VLS_169({
            // @ts-ignore
            size: (24),
        }));
        const __VLS_171 = __VLS_170({
            size: (24),
        }, ...__VLS_functionalComponentArgsRest(__VLS_170));
    }
}
// @ts-ignore
[];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
