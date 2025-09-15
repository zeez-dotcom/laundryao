export interface BranchInfo {
  name?: string;
  address?: string | null;
  phone?: string | null;
  tagline?: string | null;
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
