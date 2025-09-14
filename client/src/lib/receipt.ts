export interface BranchInfo {
  name?: string;
  address?: string;
  phone?: string;
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
