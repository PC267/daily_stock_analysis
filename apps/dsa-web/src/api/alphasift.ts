import axios from 'axios';
import { toCamelCase } from './utils';

export interface AlphasiftScreenRequest {
  strategy: string;
  market?: string;
  max_output?: number;
  use_llm?: boolean;
  llm_context?: string;
  post_analyzers?: string;
  collect_llm_candidate_context?: boolean;
  deep_analysis?: boolean;
}

export interface PickItem {
  rank: number;
  code: string;
  name: string;
  finalScore: number;
  screenScore: number;
  changePct: number;
  price: number;
  pe?: number;
  pb?: number;
  peRatio?: number;
  pbRatio?: number;
  industry: string;
  concepts: string;
}

export interface AlphasiftScreenResponse {
  taskId: string;
  strategy: string;
  message: string;
  count: number;
  picks: PickItem[];
}

export interface AlphasiftTaskStartResponse {
  taskId: string;
  status: string;
  message: string;
}

export interface AlphasiftTaskStatusResponse {
  taskId: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  message: string;
  progress: number;
  strategy?: string;
  count: number;
  picks: PickItem[];
  error?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface StrategyInfo {
  name: string;
  displayName: string;
  description: string;
  version?: string;
  category?: string;
  tags?: string[];
  marketScope?: string[];
}

export interface StrategiesResponse {
  strategies: StrategyInfo[];
}

export interface ScreenRun {
  runId: string;
  strategy: string;
  market: string;
  createdAt: string;
  picks: number;
  path: string;
}

export interface RunDetailResponse {
  runId: string;
  strategy: string;
  market: string;
  createdAt: string;
  picks: PickItem[];
  count: number;
}

export interface RunsResponse {
  runs: ScreenRun[];
  count: number;
}

const alphasiftClient = axios.create({ baseURL: '/', timeout: 300000 });
const alphasiftLongClient = axios.create({ baseURL: '/', timeout: 1800000 });

const buildPayload = (data: AlphasiftScreenRequest) => ({
  strategy: data.strategy,
  market: data.market || 'cn',
  max_output: data.max_output,
  use_llm: data.use_llm ?? false,
  llm_context: data.llm_context,
  post_analyzers: data.post_analyzers,
  collect_llm_candidate_context: data.collect_llm_candidate_context,
  deep_analysis: data.deep_analysis,
});

export const alphasiftApi = {
  screen: async (data: AlphasiftScreenRequest): Promise<AlphasiftScreenResponse> => {
    const response = await alphasiftLongClient.post<Record<string, unknown>>(
      '/api/v1/alphasift/screen',
      buildPayload(data)
    );
    return toCamelCase<AlphasiftScreenResponse>(response.data);
  },

  startScreen: async (data: AlphasiftScreenRequest): Promise<AlphasiftTaskStartResponse> => {
    const response = await alphasiftClient.post<Record<string, unknown>>(
      '/api/v1/alphasift/screen/start',
      buildPayload(data)
    );
    return toCamelCase<AlphasiftTaskStartResponse>(response.data);
  },

  getScreenStatus: async (taskId: string): Promise<AlphasiftTaskStatusResponse> => {
    const response = await alphasiftClient.get<Record<string, unknown>>(
      '/api/v1/alphasift/screen/status/' + taskId
    );
    return toCamelCase<AlphasiftTaskStatusResponse>(response.data);
  },

  listStrategies: async (): Promise<StrategiesResponse> => {
    const response = await alphasiftClient.get<Record<string, unknown>>(
      '/api/v1/alphasift/strategies'
    );
    return toCamelCase<StrategiesResponse>(response.data);
  },

  listRuns: async (): Promise<RunsResponse> => {
    const response = await alphasiftClient.get<Record<string, unknown>>(
      '/api/v1/alphasift/runs'
    );
    return toCamelCase<RunsResponse>(response.data);
  },

  getRun: async (runId: string): Promise<RunDetailResponse> => {
    const response = await alphasiftClient.get<Record<string, unknown>>(
      `/api/v1/alphasift/runs/${runId}`
    );
    return toCamelCase<RunDetailResponse>(response.data);
  },

  deleteRun: async (runId: string): Promise<{ success: boolean; runId: string }> => {
    const response = await alphasiftClient.delete<Record<string, unknown>>(
      "/api/v1/alphasift/runs/" + runId
    );
    return toCamelCase<{ success: boolean; runId: string }>(response.data);
  },
};