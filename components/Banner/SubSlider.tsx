import { Skeleton } from "antd";
import { ReactElement, useEffect, useRef, useState } from "react";
import Slider from "react-slick";
import { GBoxCampaign } from "src/generated/graphql";
import { slugify } from "utils/String";
import s from "./Banner.module.sass";

type Props = {
  data: GBoxCampaign[];
  slideIndex: number;
  sliderRef: any;
};

// const SkeletonContainer = (): ReactElement => {
//   return (
//     <div style={{ display: "flex", gap: "10px" }}>
//       <Skeleton.Image />
//       <Skeleton.Image />
//       <Skeleton.Image />
//       <Skeleton.Image />
//     </div>
//   );
// };

const SubSlider = (props: Props) => {
  const { data, slideIndex, sliderRef } = props;
  const [listBanner, setListBanner] = useState<GBoxCampaign[]>();

  const handleClick = (i: number) => {
    sliderRef.current.slickGoTo(i);
  };

  useEffect(() => {
    data && setListBanner([...data].sort((a, b) => a.spotlight_position! - b.spotlight_position!));
  }, [data]);

  return (
    <div className={s.subSliderContainer}>
      <div className={s.thumbs}>
        {listBanner?.map((item, index) => {
          const activeSlide = slideIndex === index ? s.active : "";

          return (
            <div
              className={`${s.thumbItem} ${activeSlide}`}
              key={index}
              // style={{ backgroundImage: `url(${item.banner_img})` }}
              onClick={() => handleClick(index)}
            >
              <img src={item.banner_img ?? ""} alt="" />
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default SubSlider;
