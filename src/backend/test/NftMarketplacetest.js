const { expect } = require('chai');
const { ethers } = require('hardhat');

const toWei = num => ethers.utils.parseEther(num.toString())
const fromWei = num => ethers.utils.formatEther(num)

describe("NftMarketplace", function() {
    let owner,addr1,addr2,addr3;
    let nft,marketplace;
    let URI = 'Sample URI'

    beforeEach(async () => {
        const NFT = await ethers.getContractFactory("NFT")
        const Marketplace = await ethers.getContractFactory("Marketplace");
        [owner,addr1,addr2,addr3] = await ethers.getSigners()
        nft = await NFT.deploy()
        marketplace = await Marketplace.deploy(1)
    })
    describe("Deployment", async () => {
        it("should track name and symbol of nft collection", async () => {
            expect(await nft.name()).to.equal('Vboy NFT')
            expect(await nft.symbol()).to.equal("DAPP")
        })
        it("should track name and symbol of nft collection", async () => {
            expect(await marketplace.feeAccount()).to.equal(owner.address)
            expect(await marketplace.feePercent()).to.equal(1)
        })
    })

    describe("Minting NFTS", async () => {
        it("Should track each minting nfts", async () => {
            await nft.connect(addr1).mint(URI)
            expect(await nft.tokenCount()).to.equal(1);
            expect(await nft.balanceOf(addr1.address)).to.equal(1);
            expect(await nft.tokenURI(1)).to.equal(URI)

            await nft.connect(addr2).mint(URI)
            expect(await nft.tokenCount()).to.equal(2);
            expect(await nft.balanceOf(addr2.address)).to.equal(1);
            expect(await nft.tokenURI(1)).to.equal(URI)
        })
    })
    
    describe("Making marketplace items", () => {
        beforeEach(async () => {
            await nft.connect(addr1).mint(URI)
            await nft.connect(addr1).setApprovalForAll(marketplace.address,true)
        })
        it("Should track new item, sell nft and emit offered event", async () => {
            await expect(marketplace.connect(addr1).makeItem(nft.address, 1, toWei(1)))
                .to.emit(marketplace, "Offered")
                .withArgs(
                    1,
                    nft.address,
                    1,
                    toWei(1),
                    addr1.address
                )
            expect(await nft.ownerOf(1)).to.equal(marketplace.address)
            expect(await marketplace.itemCount()).to.equal(1)
            
            const item = await marketplace.items(1)
            expect(item.itemId).to.equal(1)
            expect(item.nft).to.equal(nft.address)
            expect(item.tokenId).to.equal(1)
            expect(item.price).to.equal(toWei(1))
            expect(item.sold).to.equal(false)
        })
        it("Should fail if price is zero", async () => {
            await expect(marketplace.connect(addr1).makeItem(nft.address,1,0)).to.be.revertedWith("Price has to be greater than zero")
        })
    })

    describe("Purchasing marketplace items", function() {
        beforeEach(async () => {
            await nft.connect(addr1).mint(URI)
            await nft.connect(addr1).setApprovalForAll(marketplace.address,true)
            await marketplace.connect(addr1).makeItem(nft.address, 1, toWei(2))
        })
        it("Should update item as sold, pay seller, transfer nft to buyer, chargr fees and emit bought event", async () => {
            const seller_first_balance = await addr1.getBalance()
            const feeAccountInitBalance = await owner.getBalance()
            const totalPrice = await marketplace.getTotalPrice(1)
            expect(await marketplace.connect(addr2).purchaseItem(1,{ value: totalPrice }))
                .to.emit(marketplace, "Bought")
                // .withArgs(
                //     1,
                //     nft.address,
                //     1,
                //     toWei(2),
                //     addr1.address,
                //     addr2.address
                // )
            const seller_final_balance = await addr1.getBalance()
            const feeAccountfinalBalance = await owner.getBalance()

            expect(Number(fromWei(seller_final_balance))).to.equal(2 + Number(fromWei(seller_first_balance)))
            const fee = 0.01 * 2
            expect(Number(fromWei(feeAccountfinalBalance))).to.equal(fee+Number(fromWei(feeAccountInitBalance)))
            expect((await marketplace.items(1)).sold).to.be.equal(true)
            expect(await nft.ownerOf(1)).to.be.equal(addr2.address)
            // expect(await addr1.getBalance()).to.be.greaterThan(seller_first_balance)
            // expect(await owner.getBalance()).to.be.greaterThan(feeAccountInitBalance)
        })

        it("Should fail for invalid ids, sold items ans not enough eth", async () => {
            const totalPrice = await marketplace.getTotalPrice(1)

            await marketplace.connect(addr2).purchaseItem(1,{ value: totalPrice })
            await expect(marketplace.connect(owner).purchaseItem(1,{ value: totalPrice })).to.be.revertedWith("Already sold")
            
            await expect(marketplace.connect(addr3).purchaseItem(0,{ value: totalPrice })).to.be.revertedWith("It has to ba a valid item id")
            await expect(marketplace.connect(addr3).purchaseItem(5,{ value: totalPrice })).to.be.revertedWith("It has to ba a valid item id")
            
            await expect(marketplace.connect(addr3).purchaseItem(1,{ value: 0 })).to.be.revertedWith("not enough eth")
        })
    })
})