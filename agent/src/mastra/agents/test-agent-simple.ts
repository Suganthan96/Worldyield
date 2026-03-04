import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';

export const simpleTestAgent = new Agent({
  id: 'test-agent-simple',
  name: 'Simple Test Agent',
  instructions: 'You are a helpful test agent. Just respond to questions simply.',
  model: 'groq/llama-3.3-70b-versatile',
  tools: {},
  memory: new Memory(),
});
