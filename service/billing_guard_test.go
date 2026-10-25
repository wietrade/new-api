package service

import (
	"testing"

	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/stretchr/testify/assert"
)

func TestClaudeProtocolMismatch(t *testing.T) {
	for _, tc := range []struct {
		name   string
		model  string
		format types.RelayFormat
		want   bool
	}{
		{name: "claude via claude", model: "claude-opus-5-5", format: types.RelayFormatClaude, want: false},
		{name: "claude via openai", model: "claude-opus-5-5", format: types.RelayFormatOpenAI, want: true},
		{name: "claude via empty format", model: "claude-sonnet-5", format: "", want: true},
		{name: "claude via responses", model: "claude-sonnet-5-5", format: types.RelayFormatOpenAIResponses, want: true},
		{name: "claude prefix is case insensitive", model: "Claude-Haiku-5-5", format: types.RelayFormatOpenAI, want: true},
		{name: "surrounding spaces", model: "  claude-opus-4-8 ", format: types.RelayFormatOpenAI, want: true},
		{name: "gpt via openai", model: "gpt-5.6-sol", format: types.RelayFormatOpenAI, want: false},
		{name: "gpt via claude", model: "gpt-5.6-sol", format: types.RelayFormatClaude, want: false},
		{name: "empty model", model: "", format: types.RelayFormatOpenAI, want: false},
		{name: "model containing claude later", model: "my-claude-clone", format: types.RelayFormatOpenAI, want: false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			assert.Equal(t, tc.want, claudeProtocolMismatch(tc.model, tc.format))
		})
	}
}
