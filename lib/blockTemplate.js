var bignum = require('bignum');

var merkleTree = require('./merkleTree.js');
var transactions = require('./transactions.js');
var util = require('./util.js');


/**
 * The BlockTemplate class holds a single job.
 * and provides several methods to validate and submit it to the daemon coin
**/
var BlockTemplate = module.exports = function BlockTemplate(jobId, rpcData, poolAddressScript, extraNoncePlaceholder, reward, txMessages, recipients, poolOptions){

    //private members

    var submits = [];

    function getMerkleHashes(steps){
        return steps.map(function(step){
            return step.toString('hex');
        });
    }

    function getTransactionBuffers(txs){
        var txHashes = txs.map(function(tx){
            if (tx.txid !== undefined) {
                return util.uint256BufferFromHash(tx.txid);
            }
            return util.uint256BufferFromHash(tx.hash);
        });
        return [null].concat(txHashes);
    }

    function getVoteData(){
        if (!rpcData.masternode_payments || !rpcData.votes) return Buffer.from([]);

        return Buffer.concat(
            [util.varIntBuffer(rpcData.votes.length)].concat(
                rpcData.votes.map(function (vt) {
                    return Buffer.from(vt, 'hex');
                })
            )
        );
    }

    //public members

    this.rpcData = rpcData;
    this.jobId = jobId;


    this.target = rpcData.target ?
        bignum(rpcData.target, 16) :
        util.bignumFromBitsHex(rpcData.bits);

    this.difficulty = parseFloat((diff1 / this.target.toNumber()).toFixed(9));





    this.prevHashReversed = util.reverseByteOrder(Buffer.from(rpcData.previousblockhash, 'hex')).toString('hex');
    this.transactionData = Buffer.concat(rpcData.transactions.map(function(tx){
        return Buffer.from(tx.data, 'hex');
    }));
    this.merkleTree = new merkleTree(getTransactionBuffers(rpcData.transactions));
    this.merkleBranch = getMerkleHashes(this.merkleTree.steps);
    this.generationTransaction = transactions.CreateGeneration(
        rpcData,
        poolAddressScript,
        extraNoncePlaceholder,
        reward,
        txMessages,
        recipients,
        poolOptions
    );

    this.serializeCoinbase = function(extraNonce1, extraNonce2){
        return Buffer.concat([
            this.generationTransaction[0],
            extraNonce1,
            extraNonce2,
            this.generationTransaction[1]
        ]);
    };


    //https://en.bitcoin.it/wiki/Protocol_specification#Block_Headers
    this.serializeHeader = function(merkleRoot, nTime, nonce, logger){

        var header = Buffer.allocUnsafe(80);
        header.fill(0);

        logger.silly('Allocating 80 bytes of buffer');
        var position = 0;
        let length = 0;
        logger.silly('Position is 0');
        length = 4;
        header.write(nonce, position, length, 'hex');
        logger.silly('Wrote nonce=%s at position %s, %s length [HEX]', nonce, position, length);
        header.write(rpcData.bits, position += 4, length, 'hex');
        logger.silly('Wrote rpcData.bits=%s at position %s, %s length [HEX]', rpcData.bits, position, length);
        header.write(nTime, position += 4, length, 'hex');
        length = 32;
        logger.silly('Wrote nTime=%s at position %s, %s length [HEX]', nTime, position, length);
        header.write(merkleRoot, position += 4, length, 'hex');
        logger.silly('Wrote merkleRoot=%s at position %s, %s length [HEX]', merkleRoot, position, length);
        header.write(rpcData.previousblockhash, position += 32, length, 'hex');
        logger.silly('Wrote rpcData.previousblockhash=%s at position %s, %s length [HEX]', rpcData.previousblockhash, position, length);
        position = position + 32;
        header.writeUInt32BE(rpcData.version, position);
        logger.silly('Wrote with big endian rpcData.version=%s at position %s %s length [HEX]', rpcData.version, position, length);
        header = util.reverseBuffer(header);
        return header;
    };

    this.serializeBlock = function(header, coinbase){
        return Buffer.concat([
            header,

            util.varIntBuffer(this.rpcData.transactions.length + 1),
            coinbase,
            this.transactionData,

            getVoteData(),

            //POS coins require a zero byte appended to block which the daemon replaces with the signature
            Buffer.from(reward === 'POS' ? [0] : [])
        ]);
    };

    this.registerSubmit = function(extraNonce1, extraNonce2, nTime, nonce){
        var submission = extraNonce1 + extraNonce2 + nTime + nonce;
        if (submits.indexOf(submission) === -1){
            submits.push(submission);
            return true;
        }
        return false;
    };

    this.getJobParams = function(){
        if (!this.jobParams){
            this.jobParams = [
                this.jobId,
                this.prevHashReversed,
                this.generationTransaction[0].toString('hex'),
                this.generationTransaction[1].toString('hex'),
                this.merkleBranch,
                util.packInt32BE(this.rpcData.version).toString('hex'),
                this.rpcData.bits,
                util.packUInt32BE(this.rpcData.curtime).toString('hex'),
                true
            ];
        }
        return this.jobParams;
    };
};
