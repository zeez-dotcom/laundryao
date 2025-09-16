export interface BranchInfo {
  name?: string;
  nameAr?: string | null;
  address?: string | null;
  addressAr?: string | null;
  phone?: string | null;
  tagline?: string | null;
  taglineAr?: string | null;
}

export interface UserInfo {
  username?: string;
}

export const buildReceiptData = (
  order: any,
  branch?: BranchInfo | null,
  user?: UserInfo | null,
) => ({
  ...order,
  branchName: branch?.name,
  branchAddress: branch?.address,
  branchPhone: branch?.phone,
  branchTagline: branch?.tagline,
  sellerName: user?.username,
});
