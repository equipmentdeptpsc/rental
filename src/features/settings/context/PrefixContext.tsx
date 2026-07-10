import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import type {
  PrefixRecord,
  EquipmentCategory,
} from "../types";

interface PrefixContextType {
  prefixes: PrefixRecord[];

  addPrefix(
    item: PrefixRecord
  ): void;

  updatePrefix(
    item: PrefixRecord
  ): void;

  activatePrefix(
    id: string
  ): void;

  getActivePrefix():
    | PrefixRecord
    | undefined;

  getPrefixByCategory(
    category: EquipmentCategory
  ):
    | PrefixRecord
    | undefined;

  previewAssetNumber(
    category: EquipmentCategory
  ):
    | {
        prefixId: string;
        assetNo: string;
      }
    | undefined;

  generateAssetNumber(
    category: EquipmentCategory
  ):
    | {
        prefixId: string;
        assetNo: string;
      }
    | undefined;
}

const PrefixContext =
  createContext<
    PrefixContextType | undefined
  >(undefined);

const initialData: PrefixRecord[] = [
  {
    id: crypto.randomUUID(),
    code: "EX",
    description: "Excavators",
    category:
      "Non-Moving Equipment",
    nextNumber: 4,
    digits: 3,
    active: true,
  },
  {
    id: crypto.randomUUID(),
    code: "DT",
    description: "Dump Trucks",
    category:
      "Moving Equipment",
    nextNumber: 8,
    digits: 3,
    active: true,
  },
];

export function PrefixProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [
    prefixes,
    setPrefixes,
  ] = useState(initialData);

  function addPrefix(
    item: PrefixRecord
  ) {
    setPrefixes((prev) => [
      ...prev,
      item,
    ]);
  }

  function updatePrefix(
    item: PrefixRecord
  ) {
    setPrefixes((prev) =>
      prev.map((p) =>
        p.id === item.id
          ? item
          : p
      )
    );
  }

  function activatePrefix(
    id: string
  ) {
    setPrefixes((prev) =>
      prev.map((p) => ({
        ...p,
        active:
          p.id === id,
      }))
    );
  }

  function getActivePrefix() {
    return prefixes.find(
      (p) => p.active
    );
  }

  function getPrefixByCategory(
    category: EquipmentCategory
  ) {
    return prefixes.find(
      (p) =>
        p.category === category
    );
  }

  /**
   * Preview only.
   * Does NOT increment sequence.
   */
  function previewAssetNumber(
    category: EquipmentCategory
  ) {
    const prefix =
      prefixes.find(
        (p) =>
          p.category === category
      );

    if (!prefix) {
      return undefined;
    }

    return {
      prefixId: prefix.id,
      assetNo:
        `${prefix.code}-${String(
          prefix.nextNumber
        ).padStart(
          prefix.digits,
          "0"
        )}`,
    };
  }

  /**
   * Generates AND consumes the next number.
   * Call ONLY after user clicks Create.
   */
  function generateAssetNumber(
    category: EquipmentCategory
  ) {
    const prefix =
      prefixes.find(
        (p) =>
          p.category === category
      );

    if (!prefix) {
      return undefined;
    }

    const assetNo =
      `${prefix.code}-${String(
        prefix.nextNumber
      ).padStart(
        prefix.digits,
        "0"
      )}`;

    setPrefixes((prev) =>
      prev.map((p) =>
        p.id === prefix.id
          ? {
              ...p,
              nextNumber:
                p.nextNumber + 1,
            }
          : p
      )
    );

    return {
      prefixId: prefix.id,
      assetNo,
    };
  }

  const value = useMemo(
    () => ({
      prefixes,
      addPrefix,
      updatePrefix,
      activatePrefix,
      getActivePrefix,
      getPrefixByCategory,
      previewAssetNumber,
      generateAssetNumber,
    }),
    [prefixes]
  );

  return (
    <PrefixContext.Provider
      value={value}
    >
      {children}
    </PrefixContext.Provider>
  );
}

export function usePrefix() {
  const context =
    useContext(
      PrefixContext
    );

  if (!context) {
    throw new Error(
      "usePrefix must be used inside PrefixProvider."
    );
  }

  return context;
}