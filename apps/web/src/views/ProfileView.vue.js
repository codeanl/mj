import { computed, onBeforeUnmount, ref } from "vue";
import { Camera, Check, LoaderCircle, Trash2, UserRound } from "@lucide/vue";
import UserAvatar from "@/components/UserAvatar.vue";
import { apiErrorMessage } from "@/services/http";
import { notification } from "@/services/notifications";
import { useAuthStore } from "@/stores/auth";
const authStore = useAuthStore();
const username = ref(authStore.user?.username || "");
const avatarInput = ref(null);
const previewUrl = ref("");
const selectedAvatar = ref(null);
const savingProfile = ref(false);
const savingAvatar = ref(false);
const removingAvatar = ref(false);
const accountRole = computed(() => authStore.user?.role === "admin" ? "管理员" : "创作者");
const joinedAt = computed(() => authStore.user?.createdAt ? new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long", day: "numeric" }).format(new Date(authStore.user.createdAt)) : "-");
const formattedPoints = computed(() => Number(authStore.user?.pointsBalance || 0).toLocaleString("zh-CN", { maximumFractionDigits: 2 }));
function chooseAvatar() {
    avatarInput.value?.click();
}
function selectAvatar(event) {
    const input = event.target;
    const file = input.files?.[0];
    input.value = "";
    if (!file)
        return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
        notification.warning("头像仅支持 JPG、PNG 或 WebP");
        return;
    }
    if (previewUrl.value)
        URL.revokeObjectURL(previewUrl.value);
    selectedAvatar.value = file;
    previewUrl.value = URL.createObjectURL(file);
}
async function saveAvatar() {
    if (!selectedAvatar.value || savingAvatar.value)
        return;
    savingAvatar.value = true;
    try {
        await authStore.updateAvatar(selectedAvatar.value);
        URL.revokeObjectURL(previewUrl.value);
        previewUrl.value = "";
        selectedAvatar.value = null;
        notification.success("头像已更新");
    }
    catch (error) {
        notification.error(apiErrorMessage(error, "头像更新失败"));
    }
    finally {
        savingAvatar.value = false;
    }
}
async function removeAvatar() {
    if (removingAvatar.value)
        return;
    removingAvatar.value = true;
    try {
        if (previewUrl.value)
            URL.revokeObjectURL(previewUrl.value);
        previewUrl.value = "";
        selectedAvatar.value = null;
        await authStore.removeAvatar();
        notification.success("头像已移除");
    }
    catch (error) {
        notification.error(apiErrorMessage(error, "头像移除失败"));
    }
    finally {
        removingAvatar.value = false;
    }
}
async function saveProfile() {
    const value = username.value.trim();
    if (value.length < 2 || value.length > 32) {
        notification.warning("昵称需要 2-32 个字符");
        return;
    }
    savingProfile.value = true;
    try {
        await authStore.updateProfile(value);
        username.value = authStore.user?.username || value;
        notification.success("个人资料已保存");
    }
    catch (error) {
        notification.error(apiErrorMessage(error, "个人资料保存失败"));
    }
    finally {
        savingProfile.value = false;
    }
}
onBeforeUnmount(() => previewUrl.value && URL.revokeObjectURL(previewUrl.value));
const __VLS_ctx = {};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
void __VLS_ctx, __VLS_components, __VLS_intrinsics, __VLS_directives;
// @ts-ignore
__VLS_withDotValue(previewUrl, {});
// @ts-ignore
__VLS_withDotValue(selectedAvatar, {});
// @ts-ignore
__VLS_withDotValue(savingAvatar, {});
// @ts-ignore
__VLS_withDotValue(authStore, {});
// @ts-ignore
__VLS_withDotValue(removingAvatar, {});
// @ts-ignore
__VLS_withDotValue(savingProfile, {});
__VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
    ...{ class: "profile-page" },
});
/** @type {__VLS_StyleScopedClasses['profile-page']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.header, __VLS_intrinsics.header)({
    ...{ class: "profile-page__header" },
});
/** @type {__VLS_StyleScopedClasses['profile-page__header']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.h1, __VLS_intrinsics.h1)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "profile-page__body" },
});
/** @type {__VLS_StyleScopedClasses['profile-page__body']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
    ...{ class: "profile-section profile-section--identity" },
});
/** @type {__VLS_StyleScopedClasses['profile-section']} */ ;
/** @type {__VLS_StyleScopedClasses['profile-section--identity']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "profile-section__heading" },
});
/** @type {__VLS_StyleScopedClasses['profile-section__heading']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "profile-avatar-editor" },
});
/** @type {__VLS_StyleScopedClasses['profile-avatar-editor']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "profile-avatar-editor__preview" },
});
/** @type {__VLS_StyleScopedClasses['profile-avatar-editor__preview']} */ ;
if (previewUrl.value) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.img)({
        src: (previewUrl.value),
        alt: "新头像预览",
    });
}
else {
    const __VLS_0 = UserAvatar;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
    // @ts-ignore
    }));
    const __VLS_2 = __VLS_1({}, ...__VLS_functionalComponentArgsRest(__VLS_1));
}
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "profile-avatar-editor__actions" },
});
/** @type {__VLS_StyleScopedClasses['profile-avatar-editor__actions']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.input)({
    ...{ onChange: (selectAvatar) },
    ref: "avatarInput",
    type: "file",
    accept: "image/jpeg,image/png,image/webp",
});
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (chooseAvatar) },
    ...{ class: "profile-button profile-button--secondary" },
    type: "button",
});
/** @type {__VLS_StyleScopedClasses['profile-button']} */ ;
/** @type {__VLS_StyleScopedClasses['profile-button--secondary']} */ ;
let __VLS_5;
/** @ts-ignore @type { | typeof __VLS_components.Camera} */
Camera;
// @ts-ignore
const __VLS_6 = __VLS_asFunctionalComponent1(__VLS_5, new __VLS_5({
    // @ts-ignore
    size: (16),
}));
const __VLS_7 = __VLS_6({
    size: (16),
}, ...__VLS_functionalComponentArgsRest(__VLS_6));
if (selectedAvatar.value) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (saveAvatar) },
        ...{ class: "profile-button profile-button--primary" },
        type: "button",
        disabled: (savingAvatar.value),
    });
    /** @type {__VLS_StyleScopedClasses['profile-button']} */ ;
    /** @type {__VLS_StyleScopedClasses['profile-button--primary']} */ ;
    if (savingAvatar.value) {
        let __VLS_10;
        /** @ts-ignore @type { | typeof __VLS_components.LoaderCircle} */
        LoaderCircle;
        // @ts-ignore
        const __VLS_11 = __VLS_asFunctionalComponent1(__VLS_10, new __VLS_10({
            // @ts-ignore
            ...{ class: "spin" }, size: (16),
        }));
        const __VLS_12 = __VLS_11({
            ...{ class: "spin" },
            size: (16),
        }, ...__VLS_functionalComponentArgsRest(__VLS_11));
        /** @type {__VLS_StyleScopedClasses['spin']} */ ;
    }
    else {
        let __VLS_15;
        /** @ts-ignore @type { | typeof __VLS_components.Check} */
        Check;
        // @ts-ignore
        const __VLS_16 = __VLS_asFunctionalComponent1(__VLS_15, new __VLS_15({
            // @ts-ignore
            size: (16),
        }));
        const __VLS_17 = __VLS_16({
            size: (16),
        }, ...__VLS_functionalComponentArgsRest(__VLS_16));
    }
}
if (authStore.value.user?.avatarUrl || selectedAvatar.value) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (removeAvatar) },
        ...{ class: "profile-button profile-button--danger" },
        type: "button",
        disabled: (removingAvatar.value),
    });
    /** @type {__VLS_StyleScopedClasses['profile-button']} */ ;
    /** @type {__VLS_StyleScopedClasses['profile-button--danger']} */ ;
    if (removingAvatar.value) {
        let __VLS_20;
        /** @ts-ignore @type { | typeof __VLS_components.LoaderCircle} */
        LoaderCircle;
        // @ts-ignore
        const __VLS_21 = __VLS_asFunctionalComponent1(__VLS_20, new __VLS_20({
            // @ts-ignore
            ...{ class: "spin" }, size: (16),
        }));
        const __VLS_22 = __VLS_21({
            ...{ class: "spin" },
            size: (16),
        }, ...__VLS_functionalComponentArgsRest(__VLS_21));
        /** @type {__VLS_StyleScopedClasses['spin']} */ ;
    }
    else {
        let __VLS_25;
        /** @ts-ignore @type { | typeof __VLS_components.Trash2} */
        Trash2;
        // @ts-ignore
        const __VLS_26 = __VLS_asFunctionalComponent1(__VLS_25, new __VLS_25({
            // @ts-ignore
            size: (16),
        }));
        const __VLS_27 = __VLS_26({
            size: (16),
        }, ...__VLS_functionalComponentArgsRest(__VLS_26));
    }
}
__VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
    ...{ class: "profile-section" },
});
/** @type {__VLS_StyleScopedClasses['profile-section']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "profile-section__heading" },
});
/** @type {__VLS_StyleScopedClasses['profile-section__heading']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.form, __VLS_intrinsics.form)({
    ...{ onSubmit: (saveProfile) },
    ...{ class: "profile-form" },
});
/** @type {__VLS_StyleScopedClasses['profile-form']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "profile-input" },
});
/** @type {__VLS_StyleScopedClasses['profile-input']} */ ;
let __VLS_30;
/** @ts-ignore @type { | typeof __VLS_components.UserRound} */
UserRound;
// @ts-ignore
const __VLS_31 = __VLS_asFunctionalComponent1(__VLS_30, new __VLS_30({
    // @ts-ignore
    size: (17),
}));
const __VLS_32 = __VLS_31({
    size: (17),
}, ...__VLS_functionalComponentArgsRest(__VLS_31));
__VLS_asFunctionalElement1(__VLS_intrinsics.input)({
    minlength: "2",
    maxlength: "32",
    autocomplete: "nickname",
});
(__VLS_unwrap(username, {}));
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ class: "profile-button profile-button--primary" },
    type: "submit",
    disabled: (savingProfile.value),
});
/** @type {__VLS_StyleScopedClasses['profile-button']} */ ;
/** @type {__VLS_StyleScopedClasses['profile-button--primary']} */ ;
if (savingProfile.value) {
    let __VLS_35;
    /** @ts-ignore @type { | typeof __VLS_components.LoaderCircle} */
    LoaderCircle;
    // @ts-ignore
    const __VLS_36 = __VLS_asFunctionalComponent1(__VLS_35, new __VLS_35({
        // @ts-ignore
        ...{ class: "spin" }, size: (16),
    }));
    const __VLS_37 = __VLS_36({
        ...{ class: "spin" },
        size: (16),
    }, ...__VLS_functionalComponentArgsRest(__VLS_36));
    /** @type {__VLS_StyleScopedClasses['spin']} */ ;
}
else {
    let __VLS_40;
    /** @ts-ignore @type { | typeof __VLS_components.Check} */
    Check;
    // @ts-ignore
    const __VLS_41 = __VLS_asFunctionalComponent1(__VLS_40, new __VLS_40({
        // @ts-ignore
        size: (16),
    }));
    const __VLS_42 = __VLS_41({
        size: (16),
    }, ...__VLS_functionalComponentArgsRest(__VLS_41));
}
__VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
    ...{ class: "profile-section" },
});
/** @type {__VLS_StyleScopedClasses['profile-section']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "profile-section__heading" },
});
/** @type {__VLS_StyleScopedClasses['profile-section__heading']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.dl, __VLS_intrinsics.dl)({
    ...{ class: "profile-facts" },
});
/** @type {__VLS_StyleScopedClasses['profile-facts']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.dt, __VLS_intrinsics.dt)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.dd, __VLS_intrinsics.dd)({});
(authStore.value.user?.email);
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.dt, __VLS_intrinsics.dt)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.dd, __VLS_intrinsics.dd)({});
(__VLS_unwrap(accountRole, {}));
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.dt, __VLS_intrinsics.dt)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.dd, __VLS_intrinsics.dd)({});
(__VLS_unwrap(formattedPoints, {}));
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.dt, __VLS_intrinsics.dt)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.dd, __VLS_intrinsics.dd)({});
(__VLS_unwrap(joinedAt, {}));
// @ts-ignore
[previewUrl, previewUrl, selectedAvatar, selectedAvatar, savingAvatar, savingAvatar, authStore, authStore, removingAvatar, removingAvatar, username, savingProfile, savingProfile, accountRole, formattedPoints, joinedAt,];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
