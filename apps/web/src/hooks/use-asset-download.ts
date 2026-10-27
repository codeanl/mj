import type { Asset } from "@/services/assets"
import { createAssetDownloadTicket } from "@/services/assets"
import { createAssetArchiveTicket } from "@/services/assets"
import { apiErrorMessage } from "@/services/http"
import { notification } from "@/services/notifications"

export function useAssetDownload() {
  async function downloadAsset(asset: Asset) {
    try {
      const ticket = await createAssetDownloadTicket(asset.id)
      const link = document.createElement("a")
      link.href = ticket.url
      link.hidden = true
      document.body.appendChild(link)
      link.click()
      link.remove()
      return true
    } catch (error) {
      notification.error(apiErrorMessage(error, "素材下载失败"))
      return false
    }
  }

  async function downloadAssets(assets: Asset[]) {
    if (assets.length === 1) return downloadAsset(assets[0])
    try {
      const ticket = await createAssetArchiveTicket(assets.map((asset) => asset.id))
      const link = document.createElement("a")
      link.href = ticket.url
      link.hidden = true
      document.body.appendChild(link)
      link.click()
      link.remove()
      return true
    } catch (error) {
      notification.error(apiErrorMessage(error, "素材打包下载失败"))
      return false
    }
  }

  return { downloadAsset, downloadAssets }
}
