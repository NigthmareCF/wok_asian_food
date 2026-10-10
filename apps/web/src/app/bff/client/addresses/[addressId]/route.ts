import { NextRequest, NextResponse } from "next/server";
import { endpoint } from "@/modules/client-workflows/server/endpoint";
import { isUuid } from "@/modules/checkout/pickup-contract";
import {
  isClientAddress,
  parseUpdateClientAddress,
  normalizeClientAddress,
} from "@/modules/profile/address-contract";

type Context = { params: Promise<{ addressId: string }> };

function addressPath(addressId: string) {
  return `client/addresses/${encodeURIComponent(addressId)}`;
}

export const PUT = (request: NextRequest, context: Context) =>
  context.params.then(({ addressId }) => {
    if (!isUuid(addressId))
      return NextResponse.json(
        { message: "Dirección inválida." },
        { status: 400 },
      );
    return endpoint(request, {
      path: addressPath(addressId),
      method: "PUT",
      parse: parseUpdateClientAddress,
      bindClientPrincipal: true,
      validate: isClientAddress,
      normalize: normalizeClientAddress,
    });
  });

export const DELETE = (request: NextRequest, context: Context) =>
  context.params.then(({ addressId }) => {
    if (!isUuid(addressId))
      return NextResponse.json(
        { message: "Dirección inválida." },
        { status: 400 },
      );
    return endpoint(request, {
      path: addressPath(addressId),
      method: "DELETE",
      emptyResponse: true,
      bindClientPrincipal: true,
      validate: () => true,
    });
  });
