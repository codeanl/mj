<script setup lang="ts">
import { computed, onMounted, ref } from "vue"
import { ElButton, ElCheckbox, ElInput, ElInputNumber, ElMessage, ElMessageBox, ElOption, ElPagination, ElSelect, ElTable, ElTableColumn } from "element-plus"
import "element-plus/es/components/button/style/css"
import "element-plus/es/components/checkbox/style/css"
import "element-plus/es/components/input/style/css"
import "element-plus/es/components/input-number/style/css"
import "element-plus/es/components/message/style/css"
import "element-plus/es/components/message-box/style/css"
import "element-plus/es/components/option/style/css"
import "element-plus/es/components/pagination/style/css"
import "element-plus/es/components/select/style/css"
import "element-plus/es/components/table/style/css"
import { Copy, Download, Gift, LoaderCircle, Search, ShieldCheck, Trash2 } from "@lucide/vue"

import * as cdkApi from "@/services/cdk"

const loading = ref(true)
const generating = ref(false)
const deleting = ref(false)
const codes = ref<cdkApi.CdkCode[]>([])
const createdCodes = ref<cdkApi.CdkCode[]>([])
const selectedCreatedIds = ref<string[]>([])
const selectedIds = ref<string[]>([])
const page = ref(1)
const total = ref(0)
const search = ref("")
const filter = ref("all")
const stats = ref({ total: 0, redeemed: 0, unused: 0, expired: 0 })
const form = ref({ count: 1, points: 10, maxRedemptions: 1, expiresInDays: 0, note: "" })

const selectedCreated = computed(() => createdCodes.value.filter((item) => selectedCreatedIds.value.includes(item.id)))
const allCreatedSelected = computed(() => createdCodes.value.length > 0 && selectedCreatedIds.value.length === createdCodes.value.length)

onMounted(() => void loadCodes())

async function loadCodes() {
  loading.value = true
  try {
    const result = await cdkApi.listCdk({ page: page.value, pageSize: 20, search: search.value.trim(), filter: filter.value })
    codes.value = result.items
    total.value = result.total
    stats.value = result.stats
    selectedIds.value = selectedIds.value.filter((id) => result.items.some((item) => item.id === id))
  } catch (error) {
    ElMessage.error(messageOf(error, "CDK 列表加载失败"))
  } finally {
    loading.value = false
  }
}

async function generate() {
  if (generating.value) return
  generating.value = true
  try {
    const items = await cdkApi.generateCdk({ ...form.value, expiresInDays: form.value.expiresInDays || null })
    createdCodes.value = [...items, ...createdCodes.value]
    selectedCreatedIds.value = items.map((item) => item.id)
    ElMessage.success(`已生成 ${items.length} 个 CDK`)
    page.value = 1
    await loadCodes()
  } catch (error) {
    ElMessage.error(messageOf(error, "CDK 生成失败"))
  } finally {
    generating.value = false
  }
}

async function copyCodes(items: cdkApi.CdkCode[]) {
  if (!items.length) return
  try {
    await navigator.clipboard.writeText(items.map((item) => item.code).join("\n"))
    ElMessage.success(`已复制 ${items.length} 个 CDK`)
  } catch {
    ElMessage.error("复制失败，请检查剪贴板权限")
  }
}

function exportCodes(items: cdkApi.CdkCode[]) {
  if (!items.length) return
  const blob = new Blob([items.map((item) => item.code).join("\n")], { type: "text/plain;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = `nova-cdk-${new Date().toISOString().slice(0, 10)}.txt`
  anchor.click()
  URL.revokeObjectURL(url)
}

async function remove(ids: string[]) {
  if (!ids.length || deleting.value) return
  try {
    await ElMessageBox.confirm(`删除选中的 ${ids.length} 个 CDK？删除后将不能再兑换，已有积分流水不会被删除。`, "删除 CDK", { type: "warning", confirmButtonText: "删除", cancelButtonText: "取消" })
  } catch {
    return
  }
  deleting.value = true
  try {
    if (ids.length === 1) await cdkApi.deleteCdk(ids[0])
    else await cdkApi.deleteCdkBatch(ids)
    createdCodes.value = createdCodes.value.filter((item) => !ids.includes(item.id))
    selectedCreatedIds.value = selectedCreatedIds.value.filter((id) => !ids.includes(id))
    selectedIds.value = selectedIds.value.filter((id) => !ids.includes(id))
    ElMessage.success("CDK 已删除")
    await loadCodes()
  } catch (error) {
    ElMessage.error(messageOf(error, "CDK 删除失败"))
  } finally {
    deleting.value = false
  }
}

function statusOf(value: unknown) {
  const item = value as cdkApi.CdkCode
  if (item.expiresAt && new Date(item.expiresAt).getTime() <= Date.now()) return ["已过期", "expired"]
  if (item.redeemedCount >= item.maxRedemptions) return ["已兑完", "used"]
  if (item.redeemedCount > 0) return ["兑换中", "partial"]
  return ["未兑换", "active"]
}

function copyRow(value: unknown) {
  return copyCodes([value as cdkApi.CdkCode])
}

function formatDate(value?: string) {
  return value ? new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value)) : "长期有效"
}

function formatPoints(value: number) {
  return Number(value).toLocaleString("zh-CN", { maximumFractionDigits: 2 })
}

function accountLabel(value: number) {
  return `ID：${String(value).padStart(4, "0")}`
}

function messageOf(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}
</script>

<template>
  <section class="cdk-workspace">
    <div class="cdk-metrics">
      <div><span>CDK 总数</span><strong>{{ stats.total }}</strong></div>
      <div><span>已兑换</span><strong>{{ stats.redeemed }}</strong></div>
      <div><span>未兑换</span><strong>{{ stats.unused }}</strong></div>
      <div><span>已过期</span><strong>{{ stats.expired }}</strong></div>
    </div>

    <div class="cdk-top-grid">
      <section class="cdk-panel">
        <header><span><Gift :size="17" /></span><div><strong>生成 CDK</strong><small>配置积分、可兑换次数和有效期，系统自动生成高强度密钥。</small></div></header>
        <div class="cdk-form-grid">
          <label><span>生成数量</span><ElInputNumber v-model="form.count" :min="1" :max="100" /></label>
          <label><span>单次积分</span><ElInputNumber v-model="form.points" :min="0.01" :max="1000000" :precision="2" /></label>
          <label><span>可兑换次数</span><ElInputNumber v-model="form.maxRedemptions" :min="1" :max="100000" /></label>
          <label><span>有效期</span><ElSelect v-model="form.expiresInDays"><ElOption label="长期有效" :value="0" /><ElOption label="7 天" :value="7" /><ElOption label="30 天" :value="30" /><ElOption label="90 天" :value="90" /><ElOption label="365 天" :value="365" /></ElSelect></label>
          <label class="cdk-form-note"><span>备注</span><ElInput v-model="form.note" maxlength="200" placeholder="例如：新用户活动、合作渠道" /></label>
        </div>
        <div class="cdk-panel-actions"><ElButton type="primary" :loading="generating" @click="generate"><Gift :size="15" />随机生成 CDK</ElButton></div>
      </section>

      <section class="cdk-panel">
        <header><span><ShieldCheck :size="17" /></span><div><strong>本次生成结果</strong><small>完整明文只在管理端显示，请及时复制或导出。</small></div></header>
        <div class="cdk-result-actions">
          <ElCheckbox :model-value="allCreatedSelected" :indeterminate="selectedCreatedIds.length > 0 && !allCreatedSelected" @change="(checked) => selectedCreatedIds = checked ? createdCodes.map((item) => item.id) : []">全选</ElCheckbox>
          <div><ElButton size="small" :disabled="!(selectedCreated.length || createdCodes.length)" @click="copyCodes(selectedCreated.length ? selectedCreated : createdCodes)"><Copy :size="14" />复制</ElButton><ElButton size="small" :disabled="!(selectedCreated.length || createdCodes.length)" @click="exportCodes(selectedCreated.length ? selectedCreated : createdCodes)"><Download :size="14" />导出</ElButton><ElButton size="small" type="danger" plain :loading="deleting" :disabled="!(selectedCreated.length || createdCodes.length)" @click="remove((selectedCreated.length ? selectedCreated : createdCodes).map((item) => item.id))"><Trash2 :size="14" />删除</ElButton></div>
        </div>
        <div class="cdk-created-list">
          <article v-for="item in createdCodes" :key="item.id"><ElCheckbox :model-value="selectedCreatedIds.includes(item.id)" @change="(checked) => selectedCreatedIds = checked ? [...new Set([...selectedCreatedIds, item.id])] : selectedCreatedIds.filter((id) => id !== item.id)" /><div><strong>{{ item.code }}</strong><small>{{ formatPoints(item.points) }} 积分 · 可兑 {{ item.maxRedemptions }} 次 · {{ formatDate(item.expiresAt) }}</small></div><button type="button" title="复制 CDK" @click="copyCodes([item])"><Copy :size="14" /></button></article>
          <div v-if="!createdCodes.length" class="cdk-empty">生成结果会显示在这里</div>
        </div>
      </section>
    </div>

    <section class="cdk-panel cdk-manager">
      <div class="cdk-manager-head">
        <header><span><Gift :size="17" /></span><div><strong>CDK 密钥管理</strong><small>搜索密钥、备注或兑换用户，查看兑换明细并批量删除。</small></div></header>
        <div class="cdk-filters"><ElInput v-model="search" clearable placeholder="搜索完整 CDK、备注或用户" @keyup.enter="page = 1; loadCodes()" @clear="page = 1; loadCodes()"><template #prefix><Search :size="15" /></template></ElInput><ElSelect v-model="filter" @change="page = 1; loadCodes()"><ElOption label="全部" value="all" /><ElOption label="已兑换" value="redeemed" /><ElOption label="未兑换" value="unused" /><ElOption label="已过期" value="expired" /></ElSelect><ElButton type="danger" plain :disabled="!selectedIds.length" :loading="deleting" @click="remove(selectedIds)"><Trash2 :size="14" />批量删除</ElButton></div>
      </div>

      <div v-if="loading" class="cdk-empty"><LoaderCircle class="spin" :size="18" />正在加载 CDK</div>
      <ElTable v-else :data="codes" row-key="id" empty-text="暂无符合条件的 CDK" @selection-change="(rows: cdkApi.CdkCode[]) => selectedIds = rows.map((item) => item.id)">
        <ElTableColumn type="selection" width="42" />
        <ElTableColumn label="CDK" min-width="250"><template #default="{ row }"><div class="cdk-code-cell"><strong>{{ row.code }}</strong><small>{{ row.note || "无备注" }}</small></div></template></ElTableColumn>
        <ElTableColumn label="状态" width="92"><template #default="{ row }"><span class="cdk-status" :class="`is-${statusOf(row)[1]}`">{{ statusOf(row)[0] }}</span></template></ElTableColumn>
        <ElTableColumn label="兑换规则" min-width="150"><template #default="{ row }">{{ formatPoints(row.points) }} 积分 · {{ row.redeemedCount }}/{{ row.maxRedemptions }}</template></ElTableColumn>
        <ElTableColumn label="有效期" min-width="155"><template #default="{ row }">{{ formatDate(row.expiresAt) }}</template></ElTableColumn>
        <ElTableColumn label="最近兑换" min-width="180"><template #default="{ row }"><span v-if="row.redemptions[0]">{{ row.redemptions[0].username }} · {{ accountLabel(row.redemptions[0].accountId) }}</span><span v-else class="cdk-muted">暂无兑换</span></template></ElTableColumn>
        <ElTableColumn label="操作" width="118" fixed="right"><template #default="{ row }"><div class="cdk-row-actions"><button type="button" title="复制" @click="copyRow(row)"><Copy :size="14" /></button><button type="button" title="删除" @click="remove([row.id])"><Trash2 :size="14" /></button></div></template></ElTableColumn>
      </ElTable>
      <footer class="cdk-pagination"><span>已选 {{ selectedIds.length }} 个，共 {{ total }} 条</span><ElPagination background layout="prev, pager, next" :page-size="20" :total="total" :current-page="page" @current-change="(value: number) => { page = value; loadCodes() }" /></footer>
    </section>
  </section>
</template>

<style scoped>
.cdk-workspace{display:grid;gap:14px;margin-top:14px}.cdk-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));overflow:hidden;border:1px solid #dde2e7;border-radius:7px;background:#fff}.cdk-metrics>div{display:grid;gap:5px;padding:16px 18px;border-left:1px solid #e6e9ed}.cdk-metrics>div:first-child{border-left:0}.cdk-metrics span{color:#7c858f;font-size:11px}.cdk-metrics strong{color:#20262d;font-size:23px}.cdk-top-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:14px}.cdk-panel{min-width:0;border:1px solid #dde2e7;border-radius:7px;background:#fff;padding:18px}.cdk-panel header{display:flex;align-items:flex-start;gap:10px}.cdk-panel header>span{display:inline-flex;width:32px;height:32px;align-items:center;justify-content:center;border-radius:6px;background:#edf8f3;color:#23875b}.cdk-panel header>div{display:grid;gap:4px}.cdk-panel header strong{color:#252b33;font-size:14px}.cdk-panel header small{color:#818a95;font-size:11px;line-height:1.5}.cdk-form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:13px;margin-top:18px}.cdk-form-grid label{display:grid;gap:7px;color:#515b66;font-size:11px;font-weight:650}.cdk-form-grid :deep(.el-input-number),.cdk-form-grid :deep(.el-select){width:100%}.cdk-form-note{grid-column:1/-1}.cdk-panel-actions{display:flex;justify-content:flex-end;margin-top:16px}.cdk-result-actions{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:17px;padding:9px 0;border-bottom:1px solid #e7eaee}.cdk-result-actions>div{display:flex;gap:6px}.cdk-created-list{max-height:258px;overflow-y:auto}.cdk-created-list article{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:10px;padding:11px 2px;border-bottom:1px solid #edf0f2}.cdk-created-list article>div{display:grid;min-width:0;gap:4px}.cdk-created-list strong,.cdk-code-cell strong{overflow:hidden;color:#252b33;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;text-overflow:ellipsis;white-space:nowrap}.cdk-created-list small,.cdk-code-cell small{color:#8a929b;font-size:10px}.cdk-created-list button,.cdk-row-actions button{display:inline-flex;width:30px;height:30px;align-items:center;justify-content:center;border:0;border-radius:5px;background:#f3f5f6;color:#66717c;cursor:pointer}.cdk-created-list button:hover,.cdk-row-actions button:hover{background:#e8f5ef;color:#21875b}.cdk-manager{padding:0;overflow:hidden}.cdk-manager-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:17px 18px;border-bottom:1px solid #e6e9ed}.cdk-filters{display:grid;grid-template-columns:minmax(210px,280px) 120px auto;gap:8px}.cdk-code-cell{display:grid;gap:4px}.cdk-status{display:inline-flex;align-items:center;border:1px solid;border-radius:4px;padding:3px 7px;font-size:10px}.cdk-status.is-active{border-color:#b9dfd0;background:#edf8f3;color:#287659}.cdk-status.is-partial{border-color:#b9d4e8;background:#eff7fc;color:#39799e}.cdk-status.is-used{border-color:#d8dce2;background:#f3f4f6;color:#626b75}.cdk-status.is-expired{border-color:#efc8cb;background:#fff4f5;color:#b33c47}.cdk-muted{color:#9aa1aa}.cdk-row-actions{display:flex;gap:6px}.cdk-row-actions button:last-child:hover{background:#fff0f1;color:#bf3f49}.cdk-pagination{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 16px;border-top:1px solid #e6e9ed;color:#7f8892;font-size:11px}.cdk-empty{display:flex;min-height:92px;align-items:center;justify-content:center;gap:7px;color:#9199a2;font-size:11px}
@media(max-width:900px){.cdk-top-grid{grid-template-columns:1fr}.cdk-manager-head{flex-direction:column}.cdk-filters{width:100%;grid-template-columns:minmax(0,1fr) 120px auto}}
@media(max-width:640px){.cdk-workspace{margin-top:12px}.cdk-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.cdk-metrics>div:nth-child(3){border-top:1px solid #e6e9ed;border-left:0}.cdk-metrics>div:nth-child(4){border-top:1px solid #e6e9ed}.cdk-panel{padding:14px}.cdk-form-grid{grid-template-columns:1fr}.cdk-form-note{grid-column:auto}.cdk-result-actions{align-items:flex-start;flex-direction:column}.cdk-result-actions>div{width:100%;flex-wrap:wrap}.cdk-filters{grid-template-columns:1fr 1fr}.cdk-filters :deep(.el-input){grid-column:1/-1}.cdk-pagination{align-items:flex-start;flex-direction:column}.cdk-manager :deep(.el-table){font-size:11px}}
</style>
