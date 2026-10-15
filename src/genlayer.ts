import type { CalldataEncodable } from "genlayer-js/types"

export const defaultEndpoint = import.meta.env.VITE_GENLAYER_RPC_URL || "https://studio.genlayer.com/api"
export const defaultAddress = import.meta.env.VITE_FAULTLINE_CONTRACT_ADDRESS || ""
export const chainId = Number(import.meta.env.VITE_GENLAYER_CHAIN_ID || 61999)

export type NetworkStatus = "unconfigured" | "checking" | "ready" | "error"

export type ContractSuite = {
  suite_id: string
  name: string
  policy_url: string
  baseline_url: string
  challenge_url: string
  attack_class: string
  expected_baseline: "SUPPORT" | "REJECT" | "UNCLEAR"
  expected_challenge: "SUPPORT" | "REJECT" | "UNCLEAR"
  prompt_version: string
  fixture_version: string
  canonical: boolean
  suite_sha256: string
  policy_sha256: string
  baseline_sha256: string
  challenge_sha256: string
}

export type ContractProtocol = {
  version: string
  canonical_base_url: string
  canonical_policy_sha256: string
  initialized: boolean
}

export type ContractRun = {
  run_id: string
  suite_id: string
  suite_sha256: string
  fixture_version: string
  attack_class: string
  prompt_version: string
  expected_baseline: string
  expected_challenge: string
  baseline_outcome: string
  challenge_outcome: string
  classification: "STABLE" | "CORRECTED" | "FRAGILE" | "INCONCLUSIVE" | "FAILED"
  passed: boolean
  baseline_quote: string
  challenge_quote: string
  policy_sha256: string
  baseline_sha256: string
  challenge_sha256: string
  author: string
  created_at: string
}

export type ContractStats = { suite_count: number; run_count: number }
export type WriteResult = { hash: string; status: string }

interface EthereumProvider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>
  on?(event: string, listener: (...args: unknown[]) => void): void
  removeListener?(event: string, listener: (...args: unknown[]) => void): void
}

declare global {
  interface Window { ethereum?: EthereumProvider }
}

function provider(): EthereumProvider {
  if (!window.ethereum) throw new Error("Install an EVM-compatible wallet to submit GenLayer transactions")
  return window.ethereum
}

export function isContractAddress(value: string): value is `0x${string}` {
  return /^0x[a-fA-F0-9]{40}$/.test(value)
}

export async function connectedAccount(): Promise<string> {
  if (!window.ethereum) return ""
  const accounts = await window.ethereum.request({ method: "eth_accounts" }) as string[]
  return accounts?.[0] || ""
}

export async function connectWallet(endpoint = defaultEndpoint): Promise<string> {
  const wallet = provider()
  const accounts = await wallet.request({ method: "eth_requestAccounts" }) as string[]
  if (!accounts?.[0]) throw new Error("No wallet account was selected")

  const target = `0x${chainId.toString(16)}`
  const current = await wallet.request({ method: "eth_chainId" }) as string
  if (current.toLowerCase() !== target.toLowerCase()) {
    try {
      await wallet.request({ method: "wallet_switchEthereumChain", params: [{ chainId: target }] })
    } catch (error) {
      if ((error as { code?: number }).code !== 4902) throw error
      await wallet.request({
        method: "wallet_addEthereumChain",
        params: [{
          chainId: target,
          chainName: "GenLayer Studionet",
          nativeCurrency: { name: "GEN", symbol: "GEN", decimals: 18 },
          rpcUrls: [endpoint],
        }],
      })
    }
  }
  return accounts[0]
}

export async function disconnectWallet(): Promise<void> {
  if (!window.ethereum) return
  try {
    await window.ethereum.request({ method: "wallet_revokePermissions", params: [{ eth_accounts: {} }] })
  } catch {
    // Some wallets do not expose permission revocation. The app still clears its session state.
  }
}

function normalize(value: unknown): unknown {
  if (value instanceof Map) return Object.fromEntries(Array.from(value, ([key, item]) => [String(key), normalize(item)]))
  if (Array.isArray(value)) return value.map(normalize)
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalize(item)]))
  return value
}

export class FaultlineClient {
  private readonly address: `0x${string}`
  private readonly clientPromise: Promise<ReturnType<(typeof import("genlayer-js"))["createClient"]>>
  private readonly onSubmitted?: (hash: string) => void

  constructor(address: string, endpoint = defaultEndpoint, account?: string, onSubmitted?: (hash: string) => void) {
    if (!isContractAddress(address)) throw new Error("FAULTLINE contract address is missing or invalid")
    this.address = address
    this.onSubmitted = onSubmitted
    this.clientPromise = Promise.all([import("genlayer-js"), import("genlayer-js/chains")]).then(([sdk, chains]) =>
      sdk.createClient({ chain: chains.studionet, endpoint, ...(account ? { account: account as `0x${string}` } : {}) }),
    )
  }

  private async read(functionName: string, args: CalldataEncodable[] = []): Promise<unknown> {
    const client = await this.clientPromise
    return normalize(await client.readContract({ address: this.address, functionName, args }))
  }

  private async write(functionName: string, args: CalldataEncodable[]): Promise<WriteResult> {
    const client = await this.clientPromise
    const hash = await client.writeContract({ address: this.address, functionName, args, value: 0n })
    this.onSubmitted?.(String(hash))
    const receipt = await client.waitForTransactionReceipt({ hash, status: "ACCEPTED" as never, retries: 120, interval: 5000 })
    const status = String(receipt.statusName || receipt.status || "UNKNOWN").toUpperCase()
    const execution = String(receipt.txExecutionResultName || "UNKNOWN").toUpperCase()
    if ((status !== "ACCEPTED" && status !== "FINALIZED") || execution !== "FINISHED_WITH_RETURN") {
      throw new Error(`GenLayer write did not execute successfully (${status} / ${execution}); inspect transaction ${String(hash)} before retrying`)
    }
    return { hash: String(hash), status }
  }

  async stats(): Promise<ContractStats> {
    const result = await this.read("get_stats") as { suite_count?: number | string; run_count?: number | string }
    return { suite_count: Number(result?.suite_count || 0), run_count: Number(result?.run_count || 0) }
  }

  async waitForRecord(runId?: string): Promise<void> {
    for (let attempt = 0; attempt < 24; attempt++) {
      if (runId) {
        const records = await this.runs()
        if (records.some((record) => record.run_id === runId)) return
      } else if ((await this.stats()).suite_count >= 4) return
      await new Promise((resolve) => setTimeout(resolve, 2500))
    }
    throw new Error("Transaction accepted but the record is still synchronizing — refresh the ledger shortly before submitting again")
  }

  async suites(): Promise<ContractSuite[]> {
    const result = await this.read("get_suites") as Record<string, ContractSuite>
    return Object.values(result || {})
  }

  async suite(suiteId: string): Promise<ContractSuite> {
    return this.read("get_suite", [suiteId]) as Promise<ContractSuite>
  }

  async protocol(): Promise<ContractProtocol> {
    return this.read("get_protocol") as Promise<ContractProtocol>
  }

  async run(runId: string): Promise<ContractRun> {
    return this.read("get_run", [runId]) as Promise<ContractRun>
  }

  async runs(): Promise<ContractRun[]> {
    const result = await this.read("get_runs") as Record<string, ContractRun>
    return Object.values(result || {}).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
  }

  execute(suiteId: string, runId: string): Promise<WriteResult> {
    return this.write("execute_suite", [suiteId, runId])
  }
}
