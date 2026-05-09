"use client";

import { useEffect, useState } from "react";

import { ApiError, apiRequest } from "@/lib/api";

interface CrmFormSuggestionsResponse {
  productTags: string[];
  associatedCompanies: string[];
}

export function useCrmFormSuggestions() {
  const [productTags, setProductTags] = useState<string[]>([]);
  const [associatedCompanies, setAssociatedCompanies] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    void apiRequest<CrmFormSuggestionsResponse>("/settings/crm-form-suggestions")
      .then((response) => {
        if (!active) return;
        setProductTags(response.productTags ?? []);
        setAssociatedCompanies(response.associatedCompanies ?? []);
      })
      .catch((requestError) => {
        if (!active) return;
        setError(requestError instanceof ApiError ? requestError.message : "Unable to load CRM form suggestions");
      });

    return () => {
      active = false;
    };
  }, []);

  return {
    productTags,
    associatedCompanies,
    error,
  };
}
