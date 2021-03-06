import { gql, useQuery } from "@apollo/client";

export function useQueryBoxHistories(includeValue: any) {
  // console.log(includeValue);
  const {
    loading,
    error,
    data: data,
    refetch,
  } = useQuery(BOX_HISTORIES, {
    variables: includeValue,
    fetchPolicy: "no-cache",
  });

  return {
    loading,
    error,
    data: data,
    refetch,
  };
}

const BOX_HISTORIES = gql`
  query historyBox($include: GBoxCampaignInclude) {
    boxCampaignBuyHistories(include: $include) {
      id
      box_campaign_uid
      quantity
      created_at
      updated_at
      status
      tx_hash
      box {
        cover_img
        name
        game {
          name
          logo
        }
      }
      box_price {
        price
        chain_symbol
        chain_icon
        chain_name
        currency_name
        currency_symbol
        boxType {
          name
          thumb_img
        }
      }
    }
  }
`;
