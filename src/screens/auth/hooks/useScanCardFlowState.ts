import {
  useCallback,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react';

import type { LocaleKey } from '../../../locales';
import type { ScanMode } from '../../../services/scanCardFlowRegistry';

export type ScanPhase = 'pin' | 'working' | 'success' | 'error';
export type PinStage = 'create' | 'confirm';

type TranslateFn = (key: LocaleKey) => string;

type ModeInstructions = {
  initCreate: string;
  initConfirm: string;
  signin: string;
};

type UseScanCardFlowStateArgs = {
  initialMode?: ScanMode;
  prefilledPin?: string;
  modeInstructions: ModeInstructions;
  onStatusChange?: (status: string) => void;
  t: TranslateFn;
};

type UseScanCardFlowStateResult = {
  mode: ScanMode;
  pinValue: string;
  pinStage: PinStage;
  confirmPinValue: string;
  phase: ScanPhase;
  statusMessage: string;
  stageLogs: string[];
  operationTokenRef: MutableRefObject<number>;
  hasPrefilledPin: boolean;
  isAutoStartPending: boolean;
  isVisualScanning: boolean;
  setMode: (mode: ScanMode) => void;
  setPinValue: (value: string) => void;
  setPinStage: (stage: PinStage) => void;
  setConfirmPinValue: (value: string) => void;
  setPhase: (phase: ScanPhase) => void;
  setStatusMessage: (message: string) => void;
  setStageLogs: Dispatch<SetStateAction<string[]>>;
  resetForMode: (nextMode: ScanMode, snapIndicator?: boolean) => void;
  handlePinChange: (value: string) => void;
  appendStageLog: (raw: string) => void;
};

const PIN_LENGTH = 4;

export const useScanCardFlowState = ({
  initialMode,
  modeInstructions,
  onStatusChange,
  prefilledPin,
  t,
}: UseScanCardFlowStateArgs): UseScanCardFlowStateResult => {
  const [mode, setMode] = useState<ScanMode>(initialMode ?? 'init');
  const [pinValue, setPinValue] = useState('');
  const [pinStage, setPinStage] = useState<PinStage>('create');
  const [confirmPinValue, setConfirmPinValue] = useState('');
  const [phase, setPhase] = useState<ScanPhase>('pin');
  const [statusMessage, setStatusMessage] = useState(t('scanStatusEnterSetup'));
  const [stageLogs, setStageLogs] = useState<string[]>([]);
  const operationTokenRef = useRef(0);
  const hasPrefilledPin = Boolean(prefilledPin);
  const isAutoStartPending = hasPrefilledPin && phase === 'pin';
  const isVisualScanning = phase === 'working' || isAutoStartPending;

  const appendStageLog = useCallback((raw: string) => {
    const message = raw.trim();
    if (!message) {
      return;
    }
    setStageLogs(previous => {
      if (previous[0] === message) {
        return previous;
      }
      return [message];
    });
  }, []);

  const resetForMode = useCallback((nextMode: ScanMode) => {
    operationTokenRef.current += 1;
    setMode(nextMode);
    setPhase('pin');
    setPinStage('create');
    setPinValue('');
    setConfirmPinValue('');
    setStageLogs([]);
    const instructions = nextMode === 'init' ? modeInstructions.initCreate : modeInstructions.signin;
    setStatusMessage(instructions);
    onStatusChange?.(instructions);
  }, [modeInstructions.initCreate, modeInstructions.signin, onStatusChange]);

  const handlePinChange = useCallback(
    (value: string) => {
      const next = value.replace(/\D/g, '').slice(0, PIN_LENGTH);
      if (mode === 'init' && pinStage === 'confirm') {
        setConfirmPinValue(next);
      } else {
        setPinValue(next);
      }
    },
    [mode, pinStage],
  );

  return {
    mode,
    pinValue,
    pinStage,
    confirmPinValue,
    phase,
    statusMessage,
    stageLogs,
    operationTokenRef,
    hasPrefilledPin,
    isAutoStartPending,
    isVisualScanning,
    setMode,
    setPinValue,
    setPinStage,
    setConfirmPinValue,
    setPhase,
    setStatusMessage,
    setStageLogs,
    resetForMode,
    handlePinChange,
    appendStageLog,
  };
};
