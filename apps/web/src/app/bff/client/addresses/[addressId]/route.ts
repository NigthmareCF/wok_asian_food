import { NextRequest, NextResponse } from "next/server";
import { endpoint } from "@/modules/client-workflows/server/endpoint";
import { isUuid } from "@/modules/checkout/pickup-contract";
import {
  isClientAddress,
  normalizeClientAddress,
  parseUpdateClientAddress,
} from "@/modules/profile/address-contract";

type Context = { params: Promise<{ addressId: string }> };

function validAddressId(addressId: string) {
  return isUuid(addressId);
}

export const PUT = (request: NextRequest, context: Context) =>
  context.params.then(({ addressId }) => {
    if (!validAddressId(addressId))
      return NextResponse.json({ message: "Dirección inválida." }, { status: 400 });
    return endpoint(request, {
      path: `client/addresses/${encodeURIComponent(addressId)}`,
      method: "PUT",
      parse: parseUpdateClientAddress,
      validate: isClientAddress,
      normalize: normalizeClientAddress,
      bindClientPrincipal: true,
    });
  });

export const DELETE = (request: NextRequest, context: Context) =>
  context.params.then(({ addressId }) => {
    if (!validAddressId(addressId))
      return NextResponse.json({ message: "Dirección inválida." }, { status: 400 });
    return endpoint(request, {
      path: `client/addresses/${encodeURIComponent(addressId)}`,
      method: "DELETE",
      validate: () => true,
      emptyResponse: true,
      bindClientPrincipal: true,
    });
  });
