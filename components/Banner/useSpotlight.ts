import { gql, useQuery } from "@apollo/client";

export function useSpotlight() {
  const { loading, error, data: resultSpotlight } = useQuery(GET_ALLBOX);

  return {
    loading,
    error,
    resultSpotlight,
  };
}

const GET_ALLBOX = gql`
  query {
    spotlightBoxCampaign {
      uid
      name
      desc
      banner_img
      cover_img
      spotlight_position
      start
      end
      opening_at
      game {
        logo
        facebook
        website
        telegram
        twitter
        discord
      }
    }
  }
`;
