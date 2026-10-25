package openai

import (
	"bufio"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/QuantumNous/new-api/common"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/relaykit/types"
)

// AggregateStreamToTextResponse drains an upstream SSE response and rebuilds a
// single non-stream chat.completion payload.
//
// Some gateways answer with text/event-stream even when the caller asked for one
// JSON object (znbcode's kimi-k3.1-pro does this). The relay normally follows the
// response content type and forwards the frames verbatim, leaving the client with
// a body it cannot parse. Channels that opt in with force_stream_upstream send
// stream=true upstream and land here, so the caller still receives the object it
// asked for.
func AggregateStreamToTextResponse(c *gin.Context, resp *http.Response, info *relaycommon.RelayInfo) (any, *types.NewAPIError) {
	defer func() {
		if resp.Body != nil {
			resp.Body.Close()
		}
	}()

	var content, reasoning strings.Builder
	toolCalls := make(map[int]map[string]any)
	var toolOrder []int
	finishReason := "chat_none"
	var usage *dto.Usage

	reader := bufio.NewReader(resp.Body)
	for {
		line, readErr := reader.ReadString('\n')
		if trimmed := strings.TrimSpace(line); strings.HasPrefix(trimmed, "data:") {
			payload := strings.TrimSpace(strings.TrimPrefix(trimmed, "data:"))
			if payload != "" && payload != "[DONE]" {
				var chunk dto.ChatCompletionsStreamResponse
				if err := common.Unmarshal([]byte(payload), &chunk); err == nil {
					absorbAggregateChunk(&chunk, &content, &reasoning, toolCalls, &toolOrder, &finishReason, &usage)
				}
			}
		}
		if readErr != nil {
			if readErr == io.EOF {
				break
			}
			return nil, types.NewOpenAIError(readErr, types.ErrorCodeBadResponseBody, http.StatusBadGateway)
		}
	}

	choice := dto.OpenAITextResponseChoice{Index: 0, FinishReason: finishReason}
	choice.Message.Role = "assistant"
	if content.Len() > 0 {
		choice.Message.Content = content.String()
	}
	if reasoning.Len() > 0 {
		text := reasoning.String()
		choice.Message.ReasoningContent = &text
	}
	if len(toolOrder) > 0 {
		calls := make([]map[string]any, 0, len(toolOrder))
		for _, index := range toolOrder {
			calls = append(calls, toolCalls[index])
		}
		if raw, err := json.Marshal(calls); err == nil {
			choice.Message.ToolCalls = raw
		}
	}

	result := dto.OpenAITextResponse{
		Id:      info.RequestId,
		Model:   info.OriginModelName,
		Object:  "chat.completion",
		Created: time.Now().Unix(),
		Choices: []dto.OpenAITextResponseChoice{choice},
	}
	if usage != nil {
		result.Usage = *usage
	}

	c.JSON(http.StatusOK, result)
	return usage, nil
}

// absorbAggregateChunk folds one SSE delta into the accumulating response.
func absorbAggregateChunk(
	chunk *dto.ChatCompletionsStreamResponse,
	content *strings.Builder,
	reasoning *strings.Builder,
	toolCalls map[int]map[string]any,
	toolOrder *[]int,
	finishReason *string,
	usage **dto.Usage,
) {
	if chunk.Usage != nil && chunk.Usage.TotalTokens > 0 {
		*usage = chunk.Usage
	}
	for _, choice := range chunk.Choices {
		if choice.Delta.Content != nil {
			content.WriteString(*choice.Delta.Content)
		}
		if choice.Delta.ReasoningContent != nil {
			reasoning.WriteString(*choice.Delta.ReasoningContent)
		}
		if choice.Delta.Reasoning != nil {
			reasoning.WriteString(*choice.Delta.Reasoning)
		}
		if len(choice.Delta.ToolCalls) > 0 {
			for _, delta := range choice.Delta.ToolCalls {
				index := choice.Index
				if delta.Index != nil {
					index = *delta.Index
				}
				existing, seen := toolCalls[index]
				if !seen {
					existing = map[string]any{"type": "function", "function": map[string]any{}}
					toolCalls[index] = existing
					*toolOrder = append(*toolOrder, index)
				}
				mergeToolCallDelta(existing, delta)
			}
		}
		if choice.FinishReason != nil && *choice.FinishReason != "" {
			*finishReason = *choice.FinishReason
		}
	}
}

// mergeToolCallDelta appends streamed fragments (id, name, arguments) to a tool call.
func mergeToolCallDelta(target map[string]any, delta dto.ToolCallResponse) {
	if delta.ID != "" {
		target["id"] = delta.ID
	}
	if kind, ok := delta.Type.(string); ok && kind != "" {
		target["type"] = kind
	}
	existing, _ := target["function"].(map[string]any)
	if existing == nil {
		existing = map[string]any{}
		target["function"] = existing
	}
	if delta.Function.Name != "" {
		existing["name"] = delta.Function.Name
	}
	if delta.Function.Arguments != "" {
		prev, _ := existing["arguments"].(string)
		existing["arguments"] = prev + delta.Function.Arguments
	}
}
