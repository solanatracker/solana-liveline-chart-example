'use client';

import { createContext, useContext, useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getClient } from '@/services/api';

const DEFAULT_TOKEN = 'So11111111111111111111111111111111111111112';

export interface TokenData {
  name: string;
  symbol: string;
  image: string;
  mint: string;
  decimals: number;
  priceUsd: number;
  marketCapUsd: number;
  liquidityUsd: number;
  volume24h: number;
  priceChange24h: number;
}

interface TokenContextValue {
  token: TokenData | null;
  tokenAddress: string;
  setTokenAddress: (addr: string) => void;
  price: number;
  isLoading: boolean;
}

const TokenContext = createContext<TokenContextValue>({
  token: null,
  tokenAddress: DEFAULT_TOKEN,
  setTokenAddress: () => {},
  price: 0,
  isLoading: false,
});

export function useToken() {
  const ctx = useContext(TokenContext);
  return { token: ctx.token, tokenAddress: ctx.tokenAddress, setTokenAddress: ctx.setTokenAddress };
}

export function useTokenInfo() {
  const ctx = useContext(TokenContext);
  return { price: ctx.price, token: ctx.token, isLoading: ctx.isLoading };
}

function parseTokenData(data: Record<string, any>, address: string): TokenData {
  const pool = data?.pools?.[0] || {};
  return {
    name: data?.token?.name || data?.name || 'Unknown',
    symbol: data?.token?.symbol || data?.symbol || '???',
    image: data?.token?.image || data?.image || '',
    mint: address,
    decimals: data?.token?.decimals || data?.decimals || 9,
    priceUsd: pool?.price?.usd || data?.price || 0,
    marketCapUsd: pool?.marketCap?.usd || data?.marketCapUsd || 0,
    liquidityUsd: pool?.liquidity?.usd || data?.liquidityUsd || 0,
    volume24h: data?.volume_24h || data?.volume?.['24h'] || 0,
    priceChange24h: data?.priceChange?.['24h'] || 0,
  };
}

export function TokenProvider({ children }: { children: React.ReactNode }) {
  const [tokenAddress, setTokenAddressState] = useState(DEFAULT_TOKEN);

  const setTokenAddress = useCallback(
    (addr: string) => {
      if (addr && addr !== tokenAddress) setTokenAddressState(addr);
    },
    [tokenAddress],
  );

  const { data: token = null, isLoading } = useQuery({
    queryKey: ['token', tokenAddress],
    queryFn: async () => {
      const data = (await getClient().getTokenInfo(tokenAddress)) as Record<string, any>;
      return parseTokenData(data, tokenAddress);
    },
    enabled: !!tokenAddress,
    staleTime: 60_000,
  });

  const price = token?.priceUsd ?? 0;

  return (
    <TokenContext.Provider value={{ token, tokenAddress, setTokenAddress, price, isLoading }}>
      {children}
    </TokenContext.Provider>
  );
}
