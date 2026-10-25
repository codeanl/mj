package modelchannels

var openAIOperations = map[string]OperationConfig{
	"text":  {CreatePath: "/chat/completions", RequestTemplate: `{"model":"{{model}}","messages":[{"role":"user","content":"{{prompt}}"}]}`, ResultField: "choices[0].message.content"},
	"image": {CreatePath: "/images/generations", EditPath: "/images/edits", RequestTemplate: `{"model":"{{model}}","prompt":"{{prompt}}","size":"{{size}}","quality":"{{quality}}"}`, ResultField: "data[0].url / data[0].b64_json", ReferenceRule: "文生图使用 /images/generations；参考图编辑使用 /images/edits multipart/form-data。", SupportsReferenceImage: true},
	"video": {CreatePath: "/videos", ImageToVideoPath: "/videos", QueryPath: "/videos/:task_id", RequestTemplate: "multipart/form-data: model、prompt、seconds、size、input_reference", ResultField: "/videos/:task_id/content", StatusField: "status", ReferenceRule: "参考图使用 multipart/form-data 的单个 input_reference 文件字段。", SupportsReferenceImage: true},
	"audio": {CreatePath: "/audio/speech", RequestTemplate: `{"model":"{{model}}","input":"{{prompt}}","voice":"alloy","response_format":"mp3"}`, ResultField: "binary"},
}

var videoSeedanceOperation = OperationConfig{CreatePath: "/contents/generations/tasks", ImageToVideoPath: "/contents/generations/tasks", QueryPath: "/contents/generations/tasks/:task_id", RequestTemplate: `{"model":"{{model}}","content":"{{content}}","ratio":"{{ratio}}","resolution":"{{resolution}}","duration":"{{duration}}","generate_audio":true,"watermark":false}`, ResultField: "content.video_url", StatusField: "status", DurationRange: "4-15 秒", ReferenceRule: "图片、视频和音频使用 content 多模态数组。", SupportsReferenceImage: true, SupportsReferenceVideo: true, SupportsReferenceAudio: true}

var registeredProtocols = []ProtocolDefinition{
	{ID: "openai", Label: "OpenAI", Description: "OpenAI 官方及严格兼容接口，支持文本、图片、视频和语音。", APIFormat: "openai", AuthMode: "bearer", ModelCatalogPaths: []string{"/v1/models"}, Capabilities: []string{"text", "image", "video", "audio"}, Operations: openAIOperations, Strict: true},
	{ID: "yumeng", Label: "昱梦", Description: "昱梦新版模型中心协议，统一提交和查询图片、视频异步任务。", APIFormat: "openai", AuthMode: "bearer", DefaultBaseURL: "https://zcbservice.aizfw.cn/kyyReactApiServer", ModelCatalogPaths: []string{}, Capabilities: []string{"image", "video"}, Operations: map[string]OperationConfig{"image": {CreatePath: "/kyyReactApiServer/v2/model-center/tasks", EditPath: "/kyyReactApiServer/v2/model-center/tasks", QueryPath: "/kyyReactApiServer/v2/model-center/tasks/:task_id", ResultField: "result_url / image_url", StatusField: "status", SupportsReferenceImage: true}, "video": {CreatePath: "/kyyReactApiServer/v2/model-center/tasks", ImageToVideoPath: "/kyyReactApiServer/v2/model-center/tasks", QueryPath: "/kyyReactApiServer/v2/model-center/tasks/:task_id", ResultField: "result_url / video_url", StatusField: "status", SupportsReferenceImage: true, SupportsReferenceVideo: true, SupportsReferenceAudio: true}}, BuiltInModels: yumengBuiltIns(), Strict: true},
	{ID: "gemini", Label: "Google Gemini / Veo", Description: "Google Gemini API 的 Veo 异步视频协议。", APIFormat: "gemini", AuthMode: "custom-header", DefaultBaseURL: "https://generativelanguage.googleapis.com", ModelCatalogPaths: []string{"/v1beta/models"}, Capabilities: []string{"video"}, Operations: map[string]OperationConfig{"video": {CreatePath: "/models/:model:predictLongRunning", ImageToVideoPath: "/models/:model:predictLongRunning", QueryPath: "/models/:model/operations/:task_id", ResultField: "response.generateVideoResponse.generatedSamples[0].video.uri", StatusField: "done", DurationRange: "4、6、8 秒", SupportsReferenceImage: true}}, Strict: true},
	{ID: "seedance", Label: "Seedance 2.0 / SD2", Description: "Seedance 2.0 多模态视频协议。", APIFormat: "openai", AuthMode: "bearer", ModelCatalogPaths: []string{"/models"}, Capabilities: []string{"video"}, Operations: map[string]OperationConfig{"video": videoSeedanceOperation}, Strict: true},
	{ID: "stable-diffusion", Label: "Stable Diffusion（SD）", Description: "Automatic1111 / Forge WebUI 图片协议。", APIFormat: "openai", AuthMode: "none", ModelCatalogPaths: []string{"/sdapi/v1/sd-models"}, Capabilities: []string{"image"}, Operations: map[string]OperationConfig{"image": {CreatePath: "/sdapi/v1/txt2img", EditPath: "/sdapi/v1/img2img", RequestTemplate: `{"prompt":"{{prompt}}","width":"{{width}}","height":"{{height}}","batch_size":1,"init_images":"{{images}}"}`, ResultField: "images[0]", SupportsReferenceImage: true}}, Strict: true},
	{ID: "volcengine-video", Label: "火山方舟视频", Description: "火山方舟视频生成协议。", APIFormat: "openai", AuthMode: "bearer", DefaultBaseURL: "https://ark.cn-beijing.volces.com/api/v3", ModelCatalogPaths: []string{"/api/v3/models"}, Capabilities: []string{"video"}, Operations: map[string]OperationConfig{"video": videoSeedanceOperation}, Strict: true},
	{ID: "sub2api", Label: "sub2api", Description: "sub2api 聚合接口；文本沿用 OpenAI，图生图使用 image_urls。", APIFormat: "openai", AuthMode: "bearer", ModelCatalogPaths: []string{"/v1/models"}, Capabilities: []string{"text", "image", "video", "audio"}, Operations: openAIOperations, Strict: true},
	{ID: "newapi", Label: "New API", Description: "New API 聚合网关，按 OpenAI 路径调用。", APIFormat: "openai", AuthMode: "bearer", ModelCatalogPaths: []string{"/v1/models"}, Capabilities: []string{"text", "image", "video", "audio"}, Operations: openAIOperations, Strict: true},
	{ID: "vozeb-recommended", Label: "VOZEB推荐", Description: "VOZEB 推荐的 JSON 异步视频协议。", APIFormat: "openai", AuthMode: "bearer", DefaultBaseURL: "https://new.aiym.ink/v1", ModelCatalogPaths: []string{"/v1/models"}, Capabilities: []string{"video"}, Operations: map[string]OperationConfig{"video": {CreatePath: "/v1/videos/generations", ImageToVideoPath: "/v1/videos/generations", QueryPath: "/v1/videos/generations/:task_id", ResultField: "metadata.url", StatusField: "status", DurationRange: "5-15 秒", SupportsReferenceImage: true, SupportsReferenceVideo: true, SupportsReferenceAudio: true}}, Strict: true},
	{ID: "seedance-special", Label: "Seedance 2.0 特价版", Description: "按特价版接口文档固定模型、参数、素材与轮询路径。", APIFormat: "openai", AuthMode: "bearer", DefaultBaseURL: "https://zcbservice.aizfw.cn/kyyReactApiServer", ModelCatalogPaths: []string{}, Capabilities: []string{"video"}, Operations: map[string]OperationConfig{"video": {CreatePath: "/v1/seedance-special/videos", ImageToVideoPath: "/v1/seedance-special/videos", QueryPath: "/v1/result/:task_id", ResultField: "video_url", StatusField: "status", DurationRange: "4-15 秒", SupportsReferenceImage: true, SupportsReferenceVideo: true, SupportsReferenceAudio: true}}, BuiltInModels: seedanceSpecialBuiltIns(), Strict: true},
	{ID: "compshare-minimax-h3", Label: "CompShare MiniMax H3", Description: "优云智算 MiniMax H3 异步多模态视频任务协议。", APIFormat: "openai", AuthMode: "bearer", DefaultBaseURL: "https://cp.compshare.cn", ModelCatalogPaths: []string{}, Capabilities: []string{"video"}, Operations: map[string]OperationConfig{"video": {CreatePath: "/minimax/v2/video_generation", ImageToVideoPath: "/minimax/v2/video_generation", QueryPath: "/minimax/v2/query/video_generation/:task_id", CancelPath: "/minimax/v2/video_generation/:task_id", CancelMethod: "DELETE", RequestTemplate: `{"model":"{{model}}","content":"{{content}}","resolution":"{{resolution}}","duration":"{{duration}}","ratio":"{{ratio}}"}`, ResultField: "task.content.url", StatusField: "task.status", DurationRange: "4-30 秒", ReferenceRule: "支持 first_frame / last_frame，或最多 9 张参考图、3 个参考视频、3 个参考音频，总计最多 12 个。", SupportsReferenceImage: true, SupportsReferenceVideo: true, SupportsReferenceAudio: true}}, BuiltInModels: []BuiltInModel{{ID: "MiniMax-H3", Label: "MiniMax H3", Capability: "video"}, {ID: "minimax-h3-lite", Label: "MiniMax H3 Lite", Capability: "video"}}, Strict: true},
	{ID: "custom", Label: "自定义协议", Description: "声明式配置请求、查询、取消与结果字段。", APIFormat: "openai", AuthMode: "bearer", ModelCatalogPaths: []string{}, Capabilities: []string{"text", "image", "video", "audio"}, Operations: map[string]OperationConfig{}, Advanced: true},
	{ID: "globalaiopc", Label: "GlobalAiOpc", Description: "按 GlobalAiOpc 模型预设执行文本、图片与视频请求。", APIFormat: "openai", AuthMode: "bearer", ModelCatalogPaths: []string{}, Capabilities: []string{"text", "image", "video"}, Operations: map[string]OperationConfig{}, Advanced: true},
	{ID: "compatible", Label: "通用兼容", Description: "保留兼容模式并允许自定义高级路由。", APIFormat: "openai", AuthMode: "bearer", ModelCatalogPaths: []string{"/v1/models"}, Capabilities: []string{"text", "image", "video", "audio"}, Operations: map[string]OperationConfig{}, Advanced: true},
	{ID: "auto", Label: "自动识别（旧配置）", Description: "用于已有渠道过渡；新增渠道建议明确选择协议。", APIFormat: "openai", AuthMode: "bearer", ModelCatalogPaths: []string{"/v1/models"}, Capabilities: []string{"text", "image", "video", "audio"}, Operations: map[string]OperationConfig{}, Advanced: true},
}

func ProtocolDefinitions() []ProtocolDefinition {
	return registeredProtocols
}

func FindProtocolDefinition(id string) (ProtocolDefinition, bool) {
	for _, definition := range registeredProtocols {
		if definition.ID == id {
			return definition, true
		}
	}
	return ProtocolDefinition{}, false
}

func DefaultAdvancedConfig(definition ProtocolDefinition) AdvancedConfig {
	advanced := AdvancedConfig{APIFormat: definition.APIFormat, AuthMode: definition.AuthMode, ModelCatalogPaths: append([]string{}, definition.ModelCatalogPaths...), OperationConfigs: definition.Operations}
	if len(definition.Capabilities) == 1 {
		operation := definition.Operations[definition.Capabilities[0]]
		advanced.CreatePath = operation.CreatePath
		advanced.EditPath = operation.EditPath
		advanced.ImageToVideoPath = operation.ImageToVideoPath
		advanced.QueryPath = operation.QueryPath
		advanced.CancelPath = operation.CancelPath
		advanced.CancelMethod = operation.CancelMethod
		advanced.RequestTemplate = operation.RequestTemplate
		advanced.ResultField = operation.ResultField
		advanced.StatusField = operation.StatusField
		advanced.DurationRange = operation.DurationRange
		advanced.ReferenceRule = operation.ReferenceRule
		advanced.SupportsReferenceImage = operation.SupportsReferenceImage
		advanced.SupportsReferenceVideo = operation.SupportsReferenceVideo
		advanced.SupportsReferenceAudio = operation.SupportsReferenceAudio
	}
	return advanced
}

func yumengBuiltIns() []BuiltInModel {
	imageIDs := []string{"seedream_5.0Pro", "seedream-5.0"}
	videoIDs := []string{"seedance-2.5-c1", "sd_2.0_fast_special", "sd_2.0_special", "sd_2.0_discount", "sd_2.0_fast_discount", "seedance_1_5_pro_1080p", "seedance_1_5_pro_480p", "seedance_1_5_pro_720p", "videos_933_c1", "videos_fast_933_c1", "happyhorse-1.0-r2v", "happyhorse-1.0-i2v", "happyhorse-1.0-t2v", "hh-1.1-r2v-o", "hh-1.1-i2v-o", "hh-1.1-t2v-o", "happyhorse-1.1-r2v", "happyhorse-1.1-i2v", "happyhorse-1.1-t2v", "wan2.7-r2v", "wan2.7-i2v", "wan2.7-t2v", "wan2.7-videoedit", "KlingO3"}
	models := make([]BuiltInModel, 0, len(imageIDs)+len(videoIDs))
	for _, id := range imageIDs {
		models = append(models, BuiltInModel{ID: id, Label: id, Capability: "image"})
	}
	for _, id := range videoIDs {
		models = append(models, BuiltInModel{ID: id, Label: id, Capability: "video"})
	}
	return models
}

func seedanceSpecialBuiltIns() []BuiltInModel {
	ids := []string{"sd_2.0_special_720p", "sd_2.0_special_1080p", "sd_2.0_special_2k", "sd_2.0_special_4k", "sd_2.0_special_720p_with_video_ref", "sd_2.0_special_1080p_with_video_ref", "sd_2.0_special_2k_with_video_ref", "sd_2.0_special_4k_with_video_ref", "sd_2.0_fast_special_720p", "sd_2.0_fast_special_720p_with_video_ref"}
	models := make([]BuiltInModel, 0, len(ids))
	for _, id := range ids {
		models = append(models, BuiltInModel{ID: id, Label: id, Capability: "video"})
	}
	return models
}
